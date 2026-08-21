import { createHash } from "node:crypto";
import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { ExpensesService } from "../expenses/expenses.service";
import { SplitMethodDto, type ExpenseInputDto } from "../expenses/expenses.dto";
import { JobsService, PermanentJobError } from "../jobs/jobs.service";
import type {
  RecurringExpenseInputDto,
  RecurringExpensePageQueryDto,
} from "./recurring-expenses.dto";
import {
  nextOccurrences,
  validateRule,
  type RecurrenceRule,
} from "./recurrence";

const revisionInclude = { payers: true, splits: true } as const;

@Injectable()
export class RecurringExpensesService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExpensesService) private readonly expenses: ExpensesService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.jobs.register("RECURRING_DISPATCH", async () => this.dispatch());
    this.jobs.register("RECURRING_MATERIALIZE", async (payload) => {
      const occurrenceId = payload.occurrenceId;
      if (typeof occurrenceId !== "string")
        throw new PermanentJobError("INVALID_JOB_PAYLOAD");
      await this.materialize(occurrenceId);
    });
    await this.jobs.enqueue(this.prisma, {
      type: "RECURRING_DISPATCH",
      dedupeKey: `recurring-dispatch:${Math.floor(Date.now() / 60_000)}`,
      payload: {},
    });
  }

  async preview(userId: string, input: RecurringExpenseInputDto) {
    await this.expenses.preview(userId, input.template);
    return {
      occurrences: nextOccurrences(this.rule(input), Temporal.Now.instant(), 5),
    };
  }

  async create(userId: string, key: string, input: RecurringExpenseInputDto) {
    this.requireKey(key);
    const expensePreview = await this.expenses.preview(userId, input.template);
    const schedule = nextOccurrences(
      this.rule(input),
      Temporal.Now.instant(),
      1,
    )[0];
    if (!schedule)
      throw this.error(
        "INVALID_RECURRENCE",
        "The schedule has no future occurrence",
      );
    const requestHash = this.hash(input);
    const id = await this.prisma.withTransaction(async (database) => {
      const existing = await database.recurringExpenseIdempotency.findUnique({
        where: {
          actorId_operation_key: { actorId: userId, operation: "CREATE", key },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw this.error(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was used for another request",
            HttpStatus.CONFLICT,
          );
        return existing.recurringExpenseId;
      }
      const recurring = await database.recurringExpense.create({
        data: {
          creatorId: userId,
          groupId: input.template.groupId ?? null,
          friendshipId: input.template.friendshipId ?? null,
          nextRunAt: new Date(schedule.scheduledFor),
        },
      });
      const revision = await this.createRevision(
        database,
        recurring.id,
        1,
        userId,
        input,
        expensePreview,
      );
      await database.recurringExpense.update({
        where: { id: recurring.id },
        data: { currentRevisionId: revision.id },
      });
      await database.recurringExpenseIdempotency.create({
        data: {
          actorId: userId,
          operation: "CREATE",
          key,
          requestHash,
          recurringExpenseId: recurring.id,
        },
      });
      return recurring.id;
    });
    return this.detail(userId, id);
  }

  async list(userId: string, query: RecurringExpensePageQueryDto) {
    const offset = this.decodeCursor(query.cursor);
    const limit = query.limit ?? 20;
    const where: Prisma.RecurringExpenseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      OR: [
        { creatorId: userId },
        { group: { memberships: { some: { userId, leftAt: null } } } },
        {
          friendship: {
            OR: [{ firstUserId: userId }, { secondUserId: userId }],
          },
        },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.recurringExpense.findMany({
        where,
        include: { currentRevision: { include: revisionInclude } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.recurringExpense.count({ where }),
    ]);
    const memberships = await this.prisma.groupMember.findMany({
      where: {
        userId,
        leftAt: null,
        role: { in: ["OWNER", "ADMIN"] },
        groupId: {
          in: rows.flatMap((row) => (row.groupId ? [row.groupId] : [])),
        },
      },
      select: { groupId: true },
    });
    const managedGroupIds = new Set(memberships.map((item) => item.groupId));
    return {
      items: rows.map((row) =>
        this.present(
          row,
          row.creatorId === userId ||
            (row.groupId ? managedGroupIds.has(row.groupId) : false),
        ),
      ),
      nextCursor:
        offset + limit < total
          ? Buffer.from(String(offset + limit)).toString("base64url")
          : null,
    };
  }

  async detail(userId: string, id: string) {
    const row = await this.requireReadable(userId, id);
    return this.present(row, await this.canManage(userId, row));
  }

  async update(
    userId: string,
    id: string,
    version: number,
    input: RecurringExpenseInputDto,
  ) {
    await this.requireManage(userId, id);
    const preview = await this.expenses.preview(userId, input.template);
    const next = nextOccurrences(
      this.rule(input),
      Temporal.Now.instant(),
      1,
    )[0];
    if (!next)
      throw this.error(
        "INVALID_RECURRENCE",
        "The schedule has no future occurrence",
      );
    await this.prisma.withTransaction(async (database) => {
      const changed = await database.recurringExpense.updateMany({
        where: { id, version },
        data: {
          version: { increment: 1 },
          status: "ACTIVE",
          nextRunAt: new Date(next.scheduledFor),
          pausedAt: null,
          completedAt: null,
          lastFailureCode: null,
        },
      });
      if (changed.count !== 1)
        throw this.error(
          "STALE_VERSION",
          "This recurring expense changed; refresh and try again",
          HttpStatus.CONFLICT,
        );
      const revision = await this.createRevision(
        database,
        id,
        version + 1,
        userId,
        input,
        preview,
      );
      await database.recurringExpense.update({
        where: { id },
        data: {
          currentRevisionId: revision.id,
          groupId: input.template.groupId ?? null,
          friendshipId: input.template.friendshipId ?? null,
        },
      });
      await database.recurringOccurrence.updateMany({
        where: { recurringExpenseId: id, status: "PENDING" },
        data: { status: "CANCELED" },
      });
    });
    return this.detail(userId, id);
  }

  async pause(userId: string, id: string, version: number) {
    await this.requireManage(userId, id);
    const changed = await this.prisma.recurringExpense.updateMany({
      where: { id, version, status: "ACTIVE" },
      data: {
        version: { increment: 1 },
        status: "PAUSED",
        pausedAt: new Date(),
        nextRunAt: null,
      },
    });
    if (changed.count !== 1)
      throw this.error(
        "STALE_VERSION",
        "This recurring expense changed; refresh and try again",
        HttpStatus.CONFLICT,
      );
    await this.prisma.recurringOccurrence.updateMany({
      where: { recurringExpenseId: id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    return this.detail(userId, id);
  }

  async resume(userId: string, id: string, version: number) {
    const row = await this.requireManage(userId, id);
    const revision = row.currentRevision;
    if (!revision) throw this.notFound();
    const next = nextOccurrences(
      this.ruleFromRevision(revision),
      Temporal.Now.instant().add({ seconds: 1 }),
      1,
    )[0];
    if (!next)
      throw this.error(
        "INVALID_RECURRENCE",
        "The schedule has no future occurrence",
      );
    const changed = await this.prisma.recurringExpense.updateMany({
      where: { id, version, status: "PAUSED" },
      data: {
        version: { increment: 1 },
        status: "ACTIVE",
        pausedAt: null,
        nextRunAt: new Date(next.scheduledFor),
        lastFailureCode: null,
      },
    });
    if (changed.count !== 1)
      throw this.error(
        "STALE_VERSION",
        "This recurring expense changed; refresh and try again",
        HttpStatus.CONFLICT,
      );
    return this.detail(userId, id);
  }

  async occurrences(userId: string, id: string, cursor?: string, limit = 20) {
    await this.requireReadable(userId, id);
    const offset = this.decodeCursor(cursor);
    const [items, total] = await Promise.all([
      this.prisma.recurringOccurrence.findMany({
        where: { recurringExpenseId: id },
        orderBy: [{ scheduledFor: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.recurringOccurrence.count({
        where: { recurringExpenseId: id },
      }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        localDate: item.localDate.toISOString().slice(0, 10),
      })),
      nextCursor:
        offset + limit < total
          ? Buffer.from(String(offset + limit)).toString("base64url")
          : null,
    };
  }

  async retry(userId: string, id: string, occurrenceId: string) {
    await this.requireManage(userId, id);
    const changed = await this.prisma.recurringOccurrence.updateMany({
      where: { id: occurrenceId, recurringExpenseId: id, status: "FAILED" },
      data: { status: "PENDING", lastErrorCode: null },
    });
    if (changed.count !== 1)
      throw this.error(
        "OCCURRENCE_NOT_RETRYABLE",
        "This occurrence cannot be retried",
        HttpStatus.CONFLICT,
      );
    await this.jobs.enqueue(this.prisma, {
      type: "RECURRING_MATERIALIZE",
      dedupeKey: `recurring-materialize:${occurrenceId}:retry:${Date.now()}`,
      payload: { occurrenceId },
    });
    return this.occurrences(userId, id, undefined, 20);
  }

  private async dispatch(): Promise<void> {
    const due = await this.prisma.recurringExpense.findMany({
      where: { status: "ACTIVE", nextRunAt: { lte: new Date() } },
      include: { currentRevision: { include: revisionInclude } },
      orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
      take: 50,
    });
    for (const schedule of due) {
      const revision = schedule.currentRevision;
      if (!revision || !schedule.nextRunAt) continue;
      const occurrence = nextOccurrences(
        this.ruleFromRevision(revision),
        Temporal.Instant.from(schedule.nextRunAt.toISOString()),
        2,
      );
      const current = occurrence[0];
      if (!current) {
        await this.prisma.recurringExpense.update({
          where: { id: schedule.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            nextRunAt: null,
          },
        });
        continue;
      }
      await this.prisma.withTransaction(async (database) => {
        const row = await database.recurringOccurrence.upsert({
          where: {
            recurringExpenseId_occurrenceKey: {
              recurringExpenseId: schedule.id,
              occurrenceKey: current.occurrenceKey,
            },
          },
          create: {
            recurringExpenseId: schedule.id,
            revisionId: revision.id,
            occurrenceKey: current.occurrenceKey,
            localDate: new Date(`${current.localDate}T00:00:00.000Z`),
            scheduledFor: new Date(current.scheduledFor),
          },
          update: {},
        });
        await this.jobs.enqueue(database, {
          type: "RECURRING_MATERIALIZE",
          dedupeKey: `recurring-materialize:${row.id}`,
          payload: { occurrenceId: row.id },
        });
        const following = occurrence[1];
        await database.recurringExpense.update({
          where: { id: schedule.id },
          data: following
            ? { nextRunAt: new Date(following.scheduledFor) }
            : { status: "COMPLETED", completedAt: new Date(), nextRunAt: null },
        });
      });
    }
    await this.jobs.enqueue(this.prisma, {
      type: "RECURRING_DISPATCH",
      dedupeKey: `recurring-dispatch:${Math.floor(Date.now() / 60_000) + 1}`,
      payload: {},
      runAt: new Date(Math.floor(Date.now() / 60_000) * 60_000 + 60_000),
    });
  }

  private async materialize(occurrenceId: string): Promise<void> {
    const occurrence = await this.prisma.recurringOccurrence.findUnique({
      where: { id: occurrenceId },
      include: {
        recurringExpense: true,
        revision: { include: revisionInclude },
      },
    });
    if (
      !occurrence ||
      occurrence.status === "SUCCEEDED" ||
      occurrence.status === "CANCELED"
    )
      return;
    if (occurrence.recurringExpense.status !== "ACTIVE") return;
    const revision = occurrence.revision;
    const input: ExpenseInputDto = {
      ...(occurrence.recurringExpense.groupId
        ? { groupId: occurrence.recurringExpense.groupId }
        : {}),
      ...(occurrence.recurringExpense.friendshipId
        ? { friendshipId: occurrence.recurringExpense.friendshipId }
        : {}),
      ...(revision.categoryId ? { categoryId: revision.categoryId } : {}),
      description: revision.description,
      totalMinor: revision.totalMinor.toString(),
      currency: revision.currency,
      expenseDate: occurrence.localDate.toISOString().slice(0, 10),
      ...(revision.notes ? { notes: revision.notes } : {}),
      splitMethod: this.splitMethod(revision.splitMethod),
      payers: revision.payers.map((payer) => ({
        userId: payer.userId,
        amountMinor: payer.amountMinor.toString(),
      })),
      participants: revision.splits.map((split) => ({
        userId: split.userId,
        ...(split.inputValue ? { input: split.inputValue } : {}),
      })),
    };
    try {
      await this.prisma.recurringOccurrence.update({
        where: { id: occurrence.id },
        data: { status: "RUNNING", attempts: { increment: 1 } },
      });
      const expense = await this.expenses.create(
        occurrence.recurringExpense.creatorId,
        `recurring:${occurrence.id}`,
        input,
      );
      await this.prisma.recurringOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: "SUCCEEDED",
          expenseId: expense.id,
          lastErrorCode: null,
        },
      });
    } catch {
      await this.prisma.withTransaction(async (database) => {
        await database.recurringOccurrence.update({
          where: { id: occurrence.id },
          data: {
            status: "FAILED",
            lastErrorCode: "RECURRING_CONTEXT_INVALID",
          },
        });
        await database.recurringExpense.update({
          where: { id: occurrence.recurringExpenseId },
          data: {
            status: "PAUSED",
            pausedAt: new Date(),
            nextRunAt: null,
            lastFailureCode: "RECURRING_CONTEXT_INVALID",
            lastFailureAt: new Date(),
          },
        });
      });
      throw new PermanentJobError("RECURRING_CONTEXT_INVALID");
    }
  }

  private async createRevision(
    database: Prisma.TransactionClient,
    id: string,
    revisionNumber: number,
    actorId: string,
    input: RecurringExpenseInputDto,
    preview: Awaited<ReturnType<ExpensesService["preview"]>>,
  ) {
    const inputByUser = new Map(
      input.template.participants.map((item) => [item.userId, item.input]),
    );
    return database.recurringExpenseRevision.create({
      data: {
        recurringExpenseId: id,
        revision: revisionNumber,
        actorId,
        description: input.template.description.trim(),
        totalMinor: BigInt(input.template.totalMinor),
        currency: input.template.currency,
        notes: input.template.notes?.trim() || null,
        splitMethod: input.template.splitMethod,
        categoryId: input.template.categoryId ?? null,
        recurrenceUnit: input.schedule.unit,
        recurrenceInterval: input.schedule.interval,
        weekdays: input.schedule.weekdays ?? [],
        anchorDate: new Date(`${input.schedule.anchorDate}T00:00:00.000Z`),
        localTime: input.schedule.localTime,
        timezone: input.schedule.timezone,
        endDate: input.schedule.endDate
          ? new Date(`${input.schedule.endDate}T00:00:00.000Z`)
          : null,
        payers: {
          create: preview.payers.map((payer) => ({
            userId: payer.userId,
            amountMinor: BigInt(payer.amountMinor),
          })),
        },
        splits: {
          create: preview.splits.map((split) => ({
            userId: split.userId,
            amountMinor: BigInt(split.owedMinor),
            inputValue: inputByUser.get(split.userId) ?? null,
          })),
        },
      },
    });
  }

  private rule(input: RecurringExpenseInputDto): RecurrenceRule {
    const rule: RecurrenceRule = {
      unit: input.schedule.unit,
      interval: input.schedule.interval,
      weekdays: input.schedule.weekdays ?? [],
      anchorDate: input.schedule.anchorDate,
      localTime: input.schedule.localTime,
      timezone: input.schedule.timezone,
      ...(input.schedule.endDate ? { endDate: input.schedule.endDate } : {}),
    };
    try {
      validateRule(rule);
      return rule;
    } catch {
      throw this.error(
        "INVALID_RECURRENCE",
        "The recurrence schedule is invalid",
      );
    }
  }

  private splitMethod(
    value: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES",
  ): SplitMethodDto {
    return SplitMethodDto[value];
  }

  private ruleFromRevision(revision: {
    recurrenceUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
    recurrenceInterval: number;
    weekdays: number[];
    anchorDate: Date;
    localTime: string;
    timezone: string;
    endDate: Date | null;
  }): RecurrenceRule {
    return {
      unit: revision.recurrenceUnit,
      interval: revision.recurrenceInterval,
      weekdays: revision.weekdays,
      anchorDate: revision.anchorDate.toISOString().slice(0, 10),
      localTime: revision.localTime,
      timezone: revision.timezone,
      ...(revision.endDate
        ? { endDate: revision.endDate.toISOString().slice(0, 10) }
        : {}),
    };
  }

  private async requireReadable(userId: string, id: string) {
    const row = await this.prisma.recurringExpense.findFirst({
      where: {
        id,
        OR: [
          { creatorId: userId },
          { group: { memberships: { some: { userId, leftAt: null } } } },
          {
            friendship: {
              OR: [{ firstUserId: userId }, { secondUserId: userId }],
            },
          },
        ],
      },
      include: { currentRevision: { include: revisionInclude } },
    });
    if (!row) throw this.notFound();
    return row;
  }

  private async requireManage(userId: string, id: string) {
    const row = await this.prisma.recurringExpense.findFirst({
      where: {
        id,
        OR: [
          { creatorId: userId },
          {
            group: {
              memberships: {
                some: {
                  userId,
                  leftAt: null,
                  role: { in: ["OWNER", "ADMIN"] },
                },
              },
            },
          },
        ],
      },
      include: { currentRevision: { include: revisionInclude } },
    });
    if (!row) throw this.notFound();
    return row;
  }

  private async canManage(
    userId: string,
    row: { creatorId: string; groupId: string | null },
  ): Promise<boolean> {
    if (row.creatorId === userId) return true;
    if (!row.groupId) return false;
    return Boolean(
      await this.prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: row.groupId,
          leftAt: null,
          role: { in: ["OWNER", "ADMIN"] },
        },
        select: { id: true },
      }),
    );
  }

  private present(
    row: Awaited<ReturnType<RecurringExpensesService["requireReadable"]>>,
    canManage: boolean,
  ) {
    const revision = row.currentRevision;
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      creatorId: row.creatorId,
      groupId: row.groupId,
      friendshipId: row.friendshipId,
      nextRunAt: row.nextRunAt,
      lastFailureCode: row.lastFailureCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      template: revision
        ? {
            description: revision.description,
            totalMinor: revision.totalMinor.toString(),
            currency: revision.currency,
            notes: revision.notes,
            splitMethod: revision.splitMethod,
            categoryId: revision.categoryId,
            payers: revision.payers.map((item) => ({
              userId: item.userId,
              amountMinor: item.amountMinor.toString(),
            })),
            participants: revision.splits.map((item) => ({
              userId: item.userId,
              amountMinor: item.amountMinor.toString(),
              input: item.inputValue,
            })),
          }
        : null,
      schedule: revision ? this.ruleFromRevision(revision) : null,
      permissions: { canManage },
    };
  }

  private hash(input: RecurringExpenseInputDto): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }
  private requireKey(key: string): void {
    if (!key || key.length > 128)
      throw this.error(
        "IDEMPOTENCY_KEY_REQUIRED",
        "A valid Idempotency-Key is required",
      );
  }
  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Number.isInteger(value) || value < 0)
      throw this.error("INVALID_CURSOR", "Cursor is invalid");
    return value;
  }
  private notFound(): ApiException {
    return this.error(
      "RECURRING_EXPENSE_NOT_FOUND",
      "Recurring expense was not found",
      HttpStatus.NOT_FOUND,
    );
  }
  private error(
    code: string,
    message: string,
    status = HttpStatus.BAD_REQUEST,
  ): ApiException {
    return new ApiException(status, code, message);
  }
}
