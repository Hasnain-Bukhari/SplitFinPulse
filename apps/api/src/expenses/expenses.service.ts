import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  ActivitiesService,
  activityTypes,
} from "../activities/activities.service";
import { AuditService, auditActions } from "../audit/audit.service";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { isSupportedCurrencyCode } from "../currencies/currency-codes";
import { ApiException } from "../http/api.exception";
import {
  calculateSplit,
  FinancialDomainError,
  generateLedger,
  parseMinorUnits,
  validatePayers,
} from "./domain";
import type { ExpenseInputDto, ExpensePageQueryDto } from "./expenses.dto";
import {
  expenseNotFound,
  financialError,
  staleVersion,
} from "./expense-errors";
import { ExpenseAccessService } from "./expense-access.service";
import { presentRevision, revisionInclude } from "./expense-presenter";
import { CategoriesService } from "../categories/categories.service";
import { CurrenciesService } from "../currencies/currencies.service";

type Prepared = {
  totalMinor: bigint;
  payers: Array<{ userId: string; amountMinor: bigint }>;
  splits: Array<{
    userId: string;
    amountMinor: bigint;
    inputValue: string | null;
  }>;
  ledger: Array<{
    sequence: number;
    debtorId: string;
    creditorId: string;
    amountMinor: bigint;
  }>;
};

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExpenseAccessService) private readonly access: ExpenseAccessService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CategoriesService) private readonly categories: CategoriesService,
    @Inject(CurrenciesService) private readonly currencies: CurrenciesService,
  ) {}

  async preview(userId: string, input: ExpenseInputDto) {
    const context = await this.access.requireContext(
      this.prisma,
      userId,
      input.groupId,
      input.friendshipId,
    );
    await this.categories.requireAssignable(
      this.prisma,
      userId,
      input.categoryId,
    );
    const prepared = this.prepare(input, context.userIds);
    const users = await this.prisma.user.findMany({
      where: { id: { in: context.userIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    return this.presentPrepared(input, prepared, users);
  }

  async create(userId: string, idempotencyKey: string, input: ExpenseInputDto) {
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_REQUIRED",
        "A valid Idempotency-Key is required",
      );
    }
    const hash = this.requestHash(input);
    let expenseId: string;
    try {
      expenseId = await this.prisma.withTransaction(async (database) => {
        const existing = await database.expenseIdempotency.findUnique({
          where: {
            actorId_operation_key: {
              actorId: userId,
              operation: "CREATE",
              key: idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.requestHash !== hash)
            throw new ApiException(
              HttpStatus.CONFLICT,
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was used for another request",
            );
          return existing.expenseId;
        }
        const context = await this.access.requireContext(
          database,
          userId,
          input.groupId,
          input.friendshipId,
        );
        const prepared = this.prepare(input, context.userIds);
        const expense = await database.expense.create({
          data: {
            creatorId: userId,
            groupId: input.groupId ?? null,
            friendshipId: input.friendshipId ?? null,
          },
        });
        if (input.attachmentIds?.length) {
          const uniqueIds = [...new Set(input.attachmentIds)];
          if (uniqueIds.length !== input.attachmentIds.length)
            throw financialError(
              "INVALID_ATTACHMENT",
              "Choose each attachment once",
            );
          const claimed = await database.attachment.updateMany({
            where: {
              id: { in: uniqueIds },
              uploaderId: userId,
              expenseId: null,
              status: "AVAILABLE",
              createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) },
            },
            data: { expenseId: expense.id },
          });
          if (claimed.count !== uniqueIds.length)
            throw financialError(
              "INVALID_ATTACHMENT",
              "One or more attachments are unavailable",
            );
        }
        const revision = await this.createRevision(
          database,
          expense.id,
          1,
          "CREATED",
          userId,
          input,
          prepared,
          true,
        );
        await database.expense.update({
          where: { id: expense.id },
          data: { currentRevisionId: revision.id },
        });
        await database.expenseIdempotency.create({
          data: {
            actorId: userId,
            operation: "CREATE",
            key: idempotencyKey,
            requestHash: hash,
            expenseId: expense.id,
          },
        });
        await this.activities.record(database, {
          type: activityTypes.expenseCreated,
          actorId: userId,
          entityType: "EXPENSE",
          entityId: expense.id,
          ...(expense.groupId ? { groupId: expense.groupId } : {}),
          ...(expense.friendshipId
            ? { friendshipId: expense.friendshipId }
            : {}),
          audienceUserIds: context.userIds,
          payload: {
            description: input.description.trim(),
            amountMinor: input.totalMinor,
            currency: input.currency,
          },
        });
        await this.audit.record(database, {
          actorId: userId,
          action: auditActions.expenseCreated,
          targetType: "EXPENSE",
          targetId: expense.id,
        });
        return expense.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.expenseIdempotency.findUnique({
          where: {
            actorId_operation_key: {
              actorId: userId,
              operation: "CREATE",
              key: idempotencyKey,
            },
          },
        });
        if (existing?.requestHash === hash) expenseId = existing.expenseId;
        else
          throw new ApiException(
            HttpStatus.CONFLICT,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was used for another request",
          );
      } else throw error;
    }
    return this.detail(userId, expenseId);
  }

  async list(userId: string, query: ExpensePageQueryDto) {
    if (query.dateFrom) this.requireCalendarDate(query.dateFrom);
    if (query.dateTo) this.requireCalendarDate(query.dateTo);
    if (
      (query.sort === "AMOUNT_ASC" || query.sort === "AMOUNT_DESC") &&
      !query.currency
    ) {
      throw financialError(
        "CURRENCY_REQUIRED_FOR_AMOUNT_SORT",
        "Choose one currency before sorting by amount",
      );
    }
    const cursorSignature = this.listCursorSignature(query);
    const limit = query.limit ?? 20;
    const cursor = query.cursor
      ? this.decodeCursor(query.cursor, cursorSignature)
      : undefined;
    const sort = query.sort ?? "UPDATED_DESC";
    const orderBy =
      sort === "DATE_ASC"
        ? [
            { currentRevision: { expenseDate: "asc" as const } },
            { id: "asc" as const },
          ]
        : sort === "DATE_DESC"
          ? [
              { currentRevision: { expenseDate: "desc" as const } },
              { id: "desc" as const },
            ]
          : sort === "AMOUNT_ASC"
            ? [
                { currentRevision: { totalMinor: "asc" as const } },
                { id: "asc" as const },
              ]
            : sort === "AMOUNT_DESC"
              ? [
                  { currentRevision: { totalMinor: "desc" as const } },
                  { id: "desc" as const },
                ]
              : [{ updatedAt: "desc" as const }, { id: "desc" as const }];
    const rows = await this.prisma.expense.findMany({
      where: {
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.friendshipId ? { friendshipId: query.friendshipId } : {}),
        status: query.status ?? "ACTIVE",
        ...(query.currency ||
        query.dateFrom ||
        query.dateTo ||
        query.q ||
        query.categoryId ||
        query.personId
          ? {
              currentRevision: {
                ...(query.currency ? { currency: query.currency } : {}),
                ...(query.q
                  ? {
                      description: {
                        contains: query.q.trim(),
                        mode: "insensitive" as const,
                      },
                    }
                  : {}),
                ...(query.categoryId ? { categoryId: query.categoryId } : {}),
                ...(query.personId
                  ? {
                      OR: [
                        { payers: { some: { userId: query.personId } } },
                        { splits: { some: { userId: query.personId } } },
                      ],
                    }
                  : {}),
                ...(query.dateFrom || query.dateTo
                  ? {
                      expenseDate: {
                        ...(query.dateFrom
                          ? { gte: new Date(query.dateFrom) }
                          : {}),
                        ...(query.dateTo
                          ? { lte: new Date(query.dateTo) }
                          : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
        AND: [
          {
            OR: [
              {
                friendship: {
                  OR: [{ firstUserId: userId }, { secondUserId: userId }],
                },
              },
              { group: { memberships: { some: { userId, leftAt: null } } } },
              {
                revisions: {
                  some: {
                    OR: [
                      { payers: { some: { userId } } },
                      { splits: { some: { userId } } },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      include: { currentRevision: { include: revisionInclude } },
      orderBy,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      take: (query.settledState ? limit * 4 : limit) + 1,
    });
    const states = await this.settlementStates(rows.map((row) => row.id));
    const visibleRows = query.settledState
      ? rows.filter((row) => states.get(row.id)?.state === query.settledState)
      : rows;
    const items = visibleRows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.flatMap((row) => {
        if (!row.currentRevision) return [];
        return [
          {
            id: row.id,
            description: row.currentRevision.description,
            totalMinor: row.currentRevision.totalMinor.toString(),
            currency: row.currentRevision.currency,
            expenseDate: row.currentRevision.expenseDate
              .toISOString()
              .slice(0, 10),
            status: row.status,
            groupId: row.groupId,
            friendshipId: row.friendshipId,
            version: row.version,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            category: row.currentRevision.categoryName
              ? {
                  id: row.currentRevision.categoryId,
                  name: row.currentRevision.categoryName,
                  icon: row.currentRevision.categoryIcon,
                }
              : null,
            settlement: states.get(row.id) ?? {
              state: row.currentRevision.ledgerEntries.length
                ? "OPEN"
                : "SETTLED",
              allocatedMinor: "0",
              remainingMinor: row.currentRevision.ledgerEntries
                .reduce((sum, entry) => sum + entry.amountMinor, 0n)
                .toString(),
            },
          },
        ];
      }),
      nextCursor:
        visibleRows.length > limit && last
          ? this.encodeCursor(last.id, cursorSignature)
          : null,
    };
  }

  async detail(userId: string, expenseId: string) {
    await this.access.requireReadable(userId, expenseId);
    const row = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        currentRevision: { include: revisionInclude },
        group: {
          select: {
            status: true,
            memberships: {
              where: { userId, leftAt: null },
              select: { role: true },
            },
          },
        },
      },
    });
    if (!row?.currentRevision) throw expenseNotFound();
    const role = row.group?.memberships[0]?.role;
    const canManage =
      row.creatorId === userId ||
      (row.group?.status === "ACTIVE" &&
        (role === "OWNER" || role === "ADMIN"));
    const snapshot = presentRevision(row.currentRevision);
    return {
      id: row.id,
      creator: row.creator,
      groupId: row.groupId,
      friendshipId: row.friendshipId,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      permissions: {
        canEdit: canManage && row.status === "ACTIVE",
        canDelete: canManage && row.status === "ACTIVE",
        canRestore: canManage && row.status === "DELETED",
      },
      description: snapshot.description,
      totalMinor: snapshot.totalMinor,
      currency: snapshot.currency,
      expenseDate: snapshot.expenseDate,
      notes: snapshot.notes,
      splitMethod: snapshot.splitMethod,
      payers: snapshot.payers,
      splits: snapshot.splits,
      ledgerEntries: snapshot.ledgerEntries,
      category: snapshot.category,
      valuation: snapshot.valuation,
      settlement: await this.settlementExplanation(row.id),
    };
  }

  async revisions(
    userId: string,
    expenseId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    await this.access.requireReadable(userId, expenseId);
    const rows = await this.prisma.expenseRevision.findMany({
      where: {
        expenseId,
        ...(cursor
          ? { revision: { lt: this.decodeRevisionCursor(cursor) } }
          : {}),
      },
      include: revisionInclude,
      orderBy: { revision: "desc" },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map(presentRevision),
      nextCursor:
        rows.length > limit ? String(rows[limit - 1]?.revision) : null,
    };
  }

  async update(
    userId: string,
    expenseId: string,
    version: number,
    input: ExpenseInputDto,
  ) {
    await this.runConcurrentMutation(async (database) => {
      const expense = await this.access.requireManageable(
        database,
        userId,
        expenseId,
      );
      if (expense.status !== "ACTIVE") throw expenseNotFound();
      if (expense.version !== version) throw staleVersion();
      if (
        (input.groupId ?? null) !== expense.groupId ||
        (input.friendshipId ?? null) !== expense.friendshipId
      )
        throw financialError(
          "EXPENSE_CONTEXT_IMMUTABLE",
          "Expense context cannot be changed",
        );
      const context = await this.access.requireContext(
        database,
        userId,
        expense.groupId ?? undefined,
        expense.friendshipId ?? undefined,
      );
      if (input.attachmentIds?.length) {
        const uniqueIds = [...new Set(input.attachmentIds)];
        if (uniqueIds.length !== input.attachmentIds.length)
          throw financialError(
            "INVALID_ATTACHMENT",
            "Choose each attachment once",
          );
        const selectable = await database.attachment.count({
          where: {
            id: { in: uniqueIds },
            uploaderId: userId,
            status: "AVAILABLE",
            OR: [
              { expenseId: expense.id },
              {
                expenseId: null,
                createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) },
              },
            ],
          },
        });
        if (selectable !== uniqueIds.length)
          throw financialError(
            "INVALID_ATTACHMENT",
            "One or more attachments are unavailable",
          );
        await database.attachment.updateMany({
          where: {
            id: { in: uniqueIds },
            uploaderId: userId,
            expenseId: null,
          },
          data: { expenseId: expense.id },
        });
      }
      if (await this.hasActiveAllocations(database, expense.id)) {
        const source = await database.expenseRevision.findUniqueOrThrow({
          where: { id: expense.currentRevisionId! },
          include: { payers: true, splits: true },
        });
        if (!this.sameFinancialTerms(source, input)) {
          throw financialError(
            "ALLOCATED_EXPENSE_IMMUTABLE",
            "Reverse or correct related settlements before changing financial terms",
          );
        }
      }
      const prepared = this.prepare(input, context.userIds);
      const revision = await this.createRevision(
        database,
        expense.id,
        version + 1,
        "UPDATED",
        userId,
        input,
        prepared,
        true,
      );
      const changed = await database.expense.updateMany({
        where: { id: expense.id, version },
        data: { version: { increment: 1 }, currentRevisionId: revision.id },
      });
      if (changed.count !== 1) throw staleVersion();
      await this.activities.record(database, {
        type: activityTypes.expenseUpdated,
        actorId: userId,
        entityType: "EXPENSE",
        entityId: expense.id,
        ...(expense.groupId ? { groupId: expense.groupId } : {}),
        ...(expense.friendshipId ? { friendshipId: expense.friendshipId } : {}),
        audienceUserIds: context.userIds,
        payload: {
          description: input.description.trim(),
          amountMinor: input.totalMinor,
          currency: input.currency,
        },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.expenseUpdated,
        targetType: "EXPENSE",
        targetId: expense.id,
      });
    });
    return this.detail(userId, expenseId);
  }

  async remove(userId: string, expenseId: string, version: number) {
    await this.runConcurrentMutation(async (database) => {
      const expense = await this.access.requireManageable(
        database,
        userId,
        expenseId,
      );
      if (
        expense.status !== "ACTIVE" ||
        expense.version !== version ||
        !expense.currentRevisionId
      )
        throw staleVersion();
      if (await this.hasActiveAllocations(database, expense.id)) {
        throw financialError(
          "ALLOCATED_EXPENSE_IMMUTABLE",
          "Reverse or correct related settlements before deleting this expense",
        );
      }
      const source = await database.expenseRevision.findUnique({
        where: { id: expense.currentRevisionId },
        include: revisionInclude,
      });
      if (!source) throw expenseNotFound();
      const context = await this.access.requireContext(
        database,
        userId,
        expense.groupId ?? undefined,
        expense.friendshipId ?? undefined,
      );
      const input = this.inputFromRevision(expense, source);
      const prepared = {
        totalMinor: source.totalMinor,
        payers: source.payers,
        splits: source.splits,
        ledger: [],
      };
      const revision = await this.createRevision(
        database,
        expense.id,
        version + 1,
        "DELETED",
        userId,
        input,
        prepared,
        false,
      );
      const changed = await database.expense.updateMany({
        where: { id: expense.id, version },
        data: {
          version: { increment: 1 },
          status: "DELETED",
          deletedAt: new Date(),
          currentRevisionId: revision.id,
        },
      });
      if (changed.count !== 1) throw staleVersion();
      await this.activities.record(database, {
        type: activityTypes.expenseDeleted,
        actorId: userId,
        entityType: "EXPENSE",
        entityId: expense.id,
        ...(expense.groupId ? { groupId: expense.groupId } : {}),
        ...(expense.friendshipId ? { friendshipId: expense.friendshipId } : {}),
        audienceUserIds: context.userIds,
        payload: {
          description: source.description,
          amountMinor: source.totalMinor.toString(),
          currency: source.currency,
        },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.expenseDeleted,
        targetType: "EXPENSE",
        targetId: expense.id,
      });
    });
    return this.detail(userId, expenseId);
  }

  async restore(userId: string, expenseId: string, version: number) {
    await this.runConcurrentMutation(async (database) => {
      const expense = await this.access.requireManageable(
        database,
        userId,
        expenseId,
      );
      if (expense.status !== "DELETED" || expense.version !== version)
        throw staleVersion();
      const source = await database.expenseRevision.findFirst({
        where: { expenseId, action: { not: "DELETED" } },
        include: revisionInclude,
        orderBy: { revision: "desc" },
      });
      if (!source) throw expenseNotFound();
      const context = await this.access.requireContext(
        database,
        userId,
        expense.groupId ?? undefined,
        expense.friendshipId ?? undefined,
      );
      const allowed = new Set(context.userIds);
      if (
        [...source.payers, ...source.splits].some(
          (allocation) => !allowed.has(allocation.userId),
        )
      ) {
        throw financialError(
          "INVALID_PARTICIPANT",
          "Deleted expense participants must still belong to the context",
        );
      }
      const input = this.inputFromRevision(expense, source);
      const prepared = {
        totalMinor: source.totalMinor,
        payers: source.payers,
        splits: source.splits,
        ledger: generateLedger({
          payers: source.payers,
          splits: source.splits,
        }),
      };
      const revision = await this.createRevision(
        database,
        expense.id,
        version + 1,
        "RESTORED",
        userId,
        input,
        prepared,
        true,
      );
      const changed = await database.expense.updateMany({
        where: { id: expense.id, version },
        data: {
          version: { increment: 1 },
          status: "ACTIVE",
          deletedAt: null,
          currentRevisionId: revision.id,
        },
      });
      if (changed.count !== 1) throw staleVersion();
      await this.activities.record(database, {
        type: activityTypes.expenseRestored,
        actorId: userId,
        entityType: "EXPENSE",
        entityId: expense.id,
        ...(expense.groupId ? { groupId: expense.groupId } : {}),
        ...(expense.friendshipId ? { friendshipId: expense.friendshipId } : {}),
        audienceUserIds: context.userIds,
        payload: {
          description: source.description,
          amountMinor: source.totalMinor.toString(),
          currency: source.currency,
        },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.expenseRestored,
        targetType: "EXPENSE",
        targetId: expense.id,
      });
    });
    return this.detail(userId, expenseId);
  }

  private prepare(input: ExpenseInputDto, allowedUserIds: string[]): Prepared {
    try {
      const expenseDate = new Date(`${input.expenseDate}T00:00:00.000Z`);
      if (
        Number.isNaN(expenseDate.getTime()) ||
        expenseDate.toISOString().slice(0, 10) !== input.expenseDate
      ) {
        throw financialError("INVALID_EXPENSE_DATE", "Invalid expense date");
      }
      if (!isSupportedCurrencyCode(input.currency))
        throw financialError("INVALID_CURRENCY", "Unsupported currency code");
      const allowed = new Set(allowedUserIds);
      if (
        [...input.payers, ...input.participants].some(
          (row) => !allowed.has(row.userId),
        )
      )
        throw expenseNotFound();
      const totalMinor = parseMinorUnits(input.totalMinor, {
        allowZero: false,
      });
      if (totalMinor > MAX_SIGNED_BIGINT) {
        throw financialError(
          "INVALID_MINOR_UNITS",
          "Minor units exceed the supported range",
        );
      }
      const payers = validatePayers(totalMinor, input.payers);
      const splits =
        input.splitMethod === "EQUAL"
          ? calculateSplit({
              method: "EQUAL",
              totalMinor,
              participantIds: input.participants.map((row) => row.userId),
            })
          : calculateSplit({
              method: input.splitMethod,
              totalMinor,
              participants: input.participants.map((row) => ({
                userId: row.userId,
                value: row.input ?? "",
              })),
            });
      return {
        totalMinor,
        payers,
        splits,
        ledger: generateLedger({ payers, splits }),
      };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      if (error instanceof FinancialDomainError)
        throw financialError(error.code, error.message);
      throw error;
    }
  }

  private async createRevision(
    database: Prisma.TransactionClient,
    expenseId: string,
    revision: number,
    action: "CREATED" | "UPDATED" | "DELETED" | "RESTORED",
    actorId: string,
    input: ExpenseInputDto,
    prepared: Prepared,
    withLedger: boolean,
  ) {
    const category = await this.categories.requireAssignable(
      database,
      actorId,
      input.categoryId,
      expenseId,
    );
    const rates = await this.currencies.snapshotForWrite(
      database,
      actorId,
      input.currency,
      input.expenseDate,
      input.valuationId,
    );
    return database.expenseRevision.create({
      data: {
        expenseId,
        revision,
        action,
        actorId,
        description: input.description.trim(),
        totalMinor: prepared.totalMinor,
        currency: input.currency,
        expenseDate: new Date(`${input.expenseDate}T00:00:00.000Z`),
        notes: input.notes?.trim() || null,
        splitMethod: input.splitMethod,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        categoryIcon: category?.icon ?? null,
        exchangeRateSetId: rates.id,
        payers: {
          create: prepared.payers.map((row) => ({
            userId: row.userId,
            amountMinor: row.amountMinor,
          })),
        },
        splits: {
          create: prepared.splits.map((row) => ({
            userId: row.userId,
            amountMinor: row.amountMinor,
            inputValue: row.inputValue,
          })),
        },
        ...(withLedger
          ? {
              ledgerEntries: {
                create: prepared.ledger.map((row) => ({
                  ...row,
                  sourceType: "EXPENSE_REVISION" as const,
                  currency: input.currency,
                })),
              },
            }
          : {}),
      },
    });
  }

  private inputFromRevision(
    expense: { groupId: string | null; friendshipId: string | null },
    source: {
      description: string;
      totalMinor: bigint;
      currency: string;
      expenseDate: Date;
      notes: string | null;
      splitMethod: string;
      payers: Array<{ userId: string; amountMinor: bigint }>;
      splits: Array<{ userId: string; inputValue: string | null }>;
      categoryId?: string | null;
    },
  ): ExpenseInputDto {
    return {
      ...(expense.groupId ? { groupId: expense.groupId } : {}),
      ...(expense.friendshipId ? { friendshipId: expense.friendshipId } : {}),
      description: source.description,
      totalMinor: source.totalMinor.toString(),
      currency: source.currency,
      expenseDate: source.expenseDate.toISOString().slice(0, 10),
      ...(source.notes ? { notes: source.notes } : {}),
      ...(source.categoryId ? { categoryId: source.categoryId } : {}),
      splitMethod: source.splitMethod as ExpenseInputDto["splitMethod"],
      payers: source.payers.map((r) => ({
        userId: r.userId,
        amountMinor: r.amountMinor.toString(),
      })),
      participants: source.splits.map((r) => ({
        userId: r.userId,
        ...(r.inputValue ? { input: r.inputValue } : {}),
      })),
    };
  }

  private presentPrepared(
    input: ExpenseInputDto,
    prepared: Prepared,
    users: Array<{ id: string; name: string; avatarUrl: string | null }>,
  ) {
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      totalMinor: prepared.totalMinor.toString(),
      currency: input.currency,
      payers: prepared.payers.map((r) => ({
        ...r,
        user: byId.get(r.userId),
        amountMinor: r.amountMinor.toString(),
      })),
      splits: prepared.splits.map((r) => ({
        userId: r.userId,
        user: byId.get(r.userId),
        owedMinor: r.amountMinor.toString(),
        ...(r.inputValue ? { input: r.inputValue } : {}),
      })),
      ledgerEntries: prepared.ledger.map((r) => ({
        ...r,
        debtor: byId.get(r.debtorId),
        creditor: byId.get(r.creditorId),
        currency: input.currency,
        amountMinor: r.amountMinor.toString(),
      })),
    };
  }

  private requestHash(input: ExpenseInputDto): string {
    const compare = (a: { userId: string }, b: { userId: string }) =>
      a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    const canonical = {
      ...input,
      payers: [...input.payers].sort(compare),
      participants: [...input.participants].sort(compare),
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  }
  private encodeCursor(id: string, signature: string) {
    return Buffer.from(JSON.stringify({ id, signature }), "utf8").toString(
      "base64url",
    );
  }
  private decodeCursor(cursor: string, signature: string): { id: string } {
    try {
      const value = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      ) as { id: string; signature: string };
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.id,
        )
      )
        throw new Error();
      if (value.signature !== signature) throw new Error();
      return { id: value.id };
    } catch {
      throw financialError("INVALID_CURSOR", "Invalid cursor");
    }
  }

  private listCursorSignature(query: ExpensePageQueryDto): string {
    const filters = {
      groupId: query.groupId ?? null,
      friendshipId: query.friendshipId ?? null,
      status: query.status ?? "ACTIVE",
      currency: query.currency ?? null,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      q: query.q?.trim() ?? null,
      categoryId: query.categoryId ?? null,
      personId: query.personId ?? null,
      settledState: query.settledState ?? null,
      sort: query.sort ?? "UPDATED_DESC",
    };
    return createHash("sha256")
      .update(JSON.stringify(filters))
      .digest("base64url")
      .slice(0, 16);
  }

  private async settlementStates(expenseIds: string[]) {
    if (!expenseIds.length)
      return new Map<
        string,
        {
          state: "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";
          allocatedMinor: string;
          remainingMinor: string;
        }
      >();
    const [expenses, allocations] = await Promise.all([
      this.prisma.expense.findMany({
        where: { id: { in: expenseIds } },
        select: {
          id: true,
          currentRevision: {
            select: { ledgerEntries: { select: { amountMinor: true } } },
          },
        },
      }),
      this.prisma.settlementAllocation.groupBy({
        by: ["expenseId"],
        where: {
          expenseId: { in: expenseIds },
          settlementRevision: { currentFor: { is: { status: "ACTIVE" } } },
        },
        _sum: { amountMinor: true },
      }),
    ]);
    const allocated = new Map(
      allocations.map((row) => [row.expenseId, row._sum.amountMinor ?? 0n]),
    );
    return new Map(
      expenses.map((expense) => {
        const total =
          expense.currentRevision?.ledgerEntries.reduce(
            (sum, row) => sum + row.amountMinor,
            0n,
          ) ?? 0n;
        const used = allocated.get(expense.id) ?? 0n;
        const remaining = total > used ? total - used : 0n;
        const state =
          total === 0n || remaining === 0n
            ? ("SETTLED" as const)
            : used > 0n
              ? ("PARTIALLY_SETTLED" as const)
              : ("OPEN" as const);
        return [
          expense.id,
          {
            state,
            allocatedMinor: used.toString(),
            remainingMinor: remaining.toString(),
          },
        ];
      }),
    );
  }

  private async settlementExplanation(expenseId: string) {
    const [state, expense, allocations] = await Promise.all([
      this.settlementStates([expenseId]),
      this.prisma.expense.findUniqueOrThrow({
        where: { id: expenseId },
        select: {
          currentRevision: {
            select: {
              ledgerEntries: {
                select: {
                  sequence: true,
                  debtorId: true,
                  creditorId: true,
                  amountMinor: true,
                  currency: true,
                },
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      }),
      this.prisma.settlementAllocation.findMany({
        where: {
          expenseId,
          settlementRevision: { currentFor: { is: { status: "ACTIVE" } } },
        },
        include: {
          settlementRevision: {
            select: {
              settledOn: true,
              currentFor: { select: { id: true } },
            },
          },
        },
        orderBy: [
          { settlementRevision: { settledOn: "asc" } },
          { pathSequence: "asc" },
          { edgeSequence: "asc" },
          { id: "asc" },
        ],
      }),
    ]);
    const allocatedByEdge = new Map<string, bigint>();
    for (const allocation of allocations) {
      const key = `${allocation.debtorId}:${allocation.creditorId}:${allocation.currency}`;
      allocatedByEdge.set(
        key,
        (allocatedByEdge.get(key) ?? 0n) + allocation.amountMinor,
      );
    }
    const obligations = (expense.currentRevision?.ledgerEntries ?? []).map(
      (entry) => {
        const allocatedMinor =
          allocatedByEdge.get(
            `${entry.debtorId}:${entry.creditorId}:${entry.currency}`,
          ) ?? 0n;
        return {
          sequence: entry.sequence,
          debtorId: entry.debtorId,
          creditorId: entry.creditorId,
          originalMinor: entry.amountMinor.toString(),
          allocatedMinor: allocatedMinor.toString(),
          remainingMinor: (entry.amountMinor > allocatedMinor
            ? entry.amountMinor - allocatedMinor
            : 0n
          ).toString(),
          currency: entry.currency,
        };
      },
    );
    return {
      ...(state.get(expenseId) ?? {
        state: "SETTLED" as const,
        allocatedMinor: "0",
        remainingMinor: "0",
      }),
      obligations,
      resolvingSettlements: allocations.map((allocation) => ({
        settlementId: allocation.settlementRevision.currentFor?.id ?? null,
        settledOn: allocation.settlementRevision.settledOn
          .toISOString()
          .slice(0, 10),
        pathSequence: allocation.pathSequence,
        edgeSequence: allocation.edgeSequence,
        debtorId: allocation.debtorId,
        creditorId: allocation.creditorId,
        amountMinor: allocation.amountMinor.toString(),
        currency: allocation.currency,
      })),
    };
  }

  private async hasActiveAllocations(
    database: Prisma.TransactionClient,
    expenseId: string,
  ) {
    return (
      (await database.settlementAllocation.count({
        where: {
          expenseId,
          settlementRevision: { currentFor: { is: { status: "ACTIVE" } } },
        },
      })) > 0
    );
  }

  private sameFinancialTerms(
    source: {
      totalMinor: bigint;
      currency: string;
      splitMethod: string;
      payers: Array<{ userId: string; amountMinor: bigint }>;
      splits: Array<{ userId: string; inputValue: string | null }>;
    },
    input: ExpenseInputDto,
  ) {
    const payers = [...source.payers].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );
    const inputPayers = [...input.payers].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );
    const splits = [...source.splits].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );
    const participants = [...input.participants].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );
    return (
      source.totalMinor.toString() === input.totalMinor &&
      source.currency === input.currency &&
      source.splitMethod === input.splitMethod &&
      payers.length === inputPayers.length &&
      payers.every(
        (row, index) =>
          row.userId === inputPayers[index]?.userId &&
          row.amountMinor.toString() === inputPayers[index]?.amountMinor,
      ) &&
      splits.length === participants.length &&
      splits.every(
        (row, index) =>
          row.userId === participants[index]?.userId &&
          (row.inputValue ?? undefined) === participants[index]?.input,
      )
    );
  }

  private decodeRevisionCursor(cursor: string): number {
    if (!/^[1-9]\d*$/.test(cursor))
      throw financialError("INVALID_CURSOR", "Invalid cursor");
    const value = Number(cursor);
    if (!Number.isSafeInteger(value))
      throw financialError("INVALID_CURSOR", "Invalid cursor");
    return value;
  }

  private requireCalendarDate(value: string): void {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw financialError("INVALID_EXPENSE_DATE", "Invalid expense date");
    }
  }

  private async runConcurrentMutation<T>(
    work: (database: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.withTransaction(work);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        throw staleVersion();
      }
      throw error;
    }
  }
}
