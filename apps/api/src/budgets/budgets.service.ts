import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, type Budget } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { isSupportedCurrencyCode } from "../currencies/currency-codes";
import { JobsService, PermanentJobError } from "../jobs/jobs.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { BudgetInputDto } from "./budgets.dto";

@Injectable()
export class BudgetsService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}
  onModuleInit(): void {
    this.jobs.register("BUDGET_EVALUATE", async (payload) => {
      if (typeof payload.expenseId !== "string")
        throw new PermanentJobError("INVALID_JOB_PAYLOAD");
      await this.evaluateExpense(payload.expenseId);
    });
  }

  async create(userId: string, input: BudgetInputDto) {
    const normalized = await this.validate(userId, input);
    const conflict = await this.prisma.budget.findFirst({
      where: {
        status: "ACTIVE",
        scope: input.scope,
        currency: input.currency,
        ownerId: normalized.ownerId,
        groupId: normalized.groupId,
        categoryId: normalized.categoryId,
      },
    });
    if (conflict) throw this.conflict();
    const row = await this.mapUniqueConflict(() =>
      this.prisma.budget.create({
        data: {
          creatorId: userId,
          ownerId: normalized.ownerId,
          groupId: normalized.groupId,
          categoryId: normalized.categoryId,
          scope: input.scope,
          currency: input.currency,
          amountMinor: BigInt(input.amountMinor),
          startMonth: this.month(input.startMonth),
          endMonth: input.endMonth ? this.month(input.endMonth) : null,
        },
      }),
    );
    return this.detail(userId, row.id, input.startMonth);
  }

  async list(userId: string, month: string) {
    const date = this.month(month);
    const rows = await this.prisma.budget.findMany({
      where: {
        status: "ACTIVE",
        startMonth: { lte: date },
        OR: [{ endMonth: null }, { endMonth: { gte: date } }],
        AND: [
          {
            OR: [
              { ownerId: userId },
              { group: { memberships: { some: { userId, leftAt: null } } } },
            ],
          },
        ],
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            memberships: {
              where: { userId, leftAt: null },
              select: { role: true },
            },
          },
        },
        category: {
          select: { id: true, name: true, icon: true, archivedAt: true },
        },
      },
      orderBy: [{ scope: "asc" }, { createdAt: "asc" }],
    });
    return {
      month,
      items: await Promise.all(
        rows.map((row) => this.present(row, month, userId)),
      ),
    };
  }

  async detail(userId: string, id: string, month?: string) {
    const row = await this.requireReadable(userId, id);
    return this.present(
      row,
      month ?? new Date().toISOString().slice(0, 7),
      userId,
    );
  }

  async update(
    userId: string,
    id: string,
    version: number,
    input: BudgetInputDto,
  ) {
    await this.requireManage(userId, id);
    const normalized = await this.validate(userId, input);
    const changed = await this.mapUniqueConflict(() =>
      this.prisma.budget.updateMany({
        where: { id, version, status: "ACTIVE" },
        data: {
          version: { increment: 1 },
          ownerId: normalized.ownerId,
          groupId: normalized.groupId,
          categoryId: normalized.categoryId,
          scope: input.scope,
          currency: input.currency,
          amountMinor: BigInt(input.amountMinor),
          startMonth: this.month(input.startMonth),
          endMonth: input.endMonth ? this.month(input.endMonth) : null,
        },
      }),
    );
    if (!changed.count) throw this.stale();
    return this.detail(userId, id, input.startMonth);
  }

  async archive(userId: string, id: string, version: number) {
    await this.requireManage(userId, id);
    const changed = await this.prisma.budget.updateMany({
      where: { id, version, status: "ACTIVE" },
      data: {
        version: { increment: 1 },
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });
    if (!changed.count) throw this.stale();
    return { id, status: "ARCHIVED", version: version + 1 };
  }

  private async evaluateExpense(expenseId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: { currentRevision: { include: { splits: true } } },
    });
    if (!expense?.currentRevision) return;
    const revision = expense.currentRevision;
    const month = revision.expenseDate.toISOString().slice(0, 7);
    const participantIds = revision.splits.map((split) => split.userId);
    const budgets = await this.prisma.budget.findMany({
      where: {
        status: "ACTIVE",
        currency: revision.currency,
        startMonth: { lte: this.month(month) },
        OR: [{ endMonth: null }, { endMonth: { gte: this.month(month) } }],
        AND: [
          {
            OR: [
              { ownerId: { in: participantIds } },
              ...(expense.groupId ? [{ groupId: expense.groupId }] : []),
            ],
          },
        ],
      },
      include: {
        group: {
          include: {
            memberships: { where: { leftAt: null }, select: { userId: true } },
          },
        },
      },
    });
    for (const budget of budgets) {
      const spent = await this.spent(budget, month);
      for (const threshold of [80, 100]) {
        if (spent * 100n < budget.amountMinor * BigInt(threshold)) continue;
        const event = await this.prisma.budgetThresholdEvent.upsert({
          where: {
            budgetId_month_thresholdPercent: {
              budgetId: budget.id,
              month: this.month(month),
              thresholdPercent: threshold,
            },
          },
          create: {
            budgetId: budget.id,
            month: this.month(month),
            thresholdPercent: threshold,
            observedSpendMinor: spent,
          },
          update: {},
        });
        const recipients =
          budget.scope === "GROUP"
            ? (budget.group?.memberships.map((member) => member.userId) ?? [])
            : budget.ownerId
              ? [budget.ownerId]
              : [];
        for (const recipientId of recipients)
          await this.notifications.create(this.prisma, {
            recipientId,
            actorId: budget.creatorId,
            category: "BUDGET_ALERTS",
            type: "BUDGET_THRESHOLD_REACHED",
            sourceType: "BUDGET_THRESHOLD",
            sourceId: event.id,
            dedupeKey: `budget:${budget.id}:${month}:${threshold}`,
            targetType: "BUDGET",
            targetId: budget.id,
            payload: {
              month,
              thresholdPercent: threshold,
              currency: budget.currency,
            },
          });
      }
    }
  }

  private async present(
    row: Awaited<ReturnType<BudgetsService["requireReadable"]>>,
    month: string,
    userId: string,
  ) {
    const spent = await this.spent(row, month);
    return {
      id: row.id,
      scope: row.scope,
      currency: row.currency,
      amountMinor: row.amountMinor.toString(),
      month,
      spentMinor: spent.toString(),
      remainingMinor: (row.amountMinor > spent
        ? row.amountMinor - spent
        : 0n
      ).toString(),
      percentUsed: Number((spent * 10_000n) / row.amountMinor) / 100,
      startMonth: row.startMonth.toISOString().slice(0, 7),
      endMonth: row.endMonth?.toISOString().slice(0, 7) ?? null,
      status: row.status,
      version: row.version,
      group: row.group ? { id: row.group.id, name: row.group.name } : null,
      category: row.category,
      permissions: {
        canManage:
          row.ownerId === userId ||
          Boolean(
            row.group?.memberships.some((member) =>
              ["OWNER", "ADMIN"].includes(member.role),
            ),
          ),
      },
    };
  }

  private async spent(budget: Budget, month: string): Promise<bigint> {
    const start = this.month(month);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    );
    if (budget.scope === "GROUP" && budget.groupId) {
      const result = await this.prisma.expenseRevision.aggregate({
        where: {
          currency: budget.currency,
          expenseDate: { gte: start, lte: end },
          currentFor: { is: { status: "ACTIVE", groupId: budget.groupId } },
        },
        _sum: { totalMinor: true },
      });
      return result._sum.totalMinor ?? 0n;
    }
    if (!budget.ownerId) return 0n;
    const result = await this.prisma.expenseSplit.aggregate({
      where: {
        userId: budget.ownerId,
        revision: {
          currency: budget.currency,
          expenseDate: { gte: start, lte: end },
          ...(budget.scope === "CATEGORY"
            ? { categoryId: budget.categoryId }
            : {}),
          currentFor: { is: { status: "ACTIVE" } },
        },
      },
      _sum: { amountMinor: true },
    });
    return result._sum.amountMinor ?? 0n;
  }

  private async validate(userId: string, input: BudgetInputDto) {
    if (
      !isSupportedCurrencyCode(input.currency) ||
      BigInt(input.amountMinor) <= 0n
    )
      throw this.conflict();
    const start = this.month(input.startMonth);
    const end = input.endMonth ? this.month(input.endMonth) : null;
    if (end && end < start) throw this.conflict();
    if (input.scope === "PERSONAL") {
      if (input.groupId || input.categoryId) throw this.conflict();
      return { ownerId: userId, groupId: null, categoryId: null };
    }
    if (input.scope === "CATEGORY") {
      if (!input.categoryId || input.groupId) throw this.conflict();
      const category = await this.prisma.category.findFirst({
        where: {
          id: input.categoryId,
          archivedAt: null,
          OR: [{ kind: "SYSTEM" }, { ownerId: userId }],
        },
      });
      if (!category) throw this.conflict();
      return { ownerId: userId, groupId: null, categoryId: category.id };
    }
    if (!input.groupId || input.categoryId) throw this.conflict();
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId: input.groupId,
        userId,
        leftAt: null,
        role: { in: ["OWNER", "ADMIN"] },
        group: { status: "ACTIVE" },
      },
    });
    if (!membership)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "GROUP_NOT_FOUND",
        "Group not found",
      );
    return { ownerId: null, groupId: input.groupId, categoryId: null };
  }

  private async requireReadable(userId: string, id: string) {
    const row = await this.prisma.budget.findFirst({
      where: {
        id,
        OR: [
          { ownerId: userId },
          { group: { memberships: { some: { userId, leftAt: null } } } },
        ],
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            memberships: {
              where: { userId, leftAt: null },
              select: { role: true },
            },
          },
        },
        category: {
          select: { id: true, name: true, icon: true, archivedAt: true },
        },
      },
    });
    if (!row)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "BUDGET_NOT_FOUND",
        "Budget was not found",
      );
    return row;
  }
  private async requireManage(userId: string, id: string) {
    const row = await this.requireReadable(userId, id);
    if (
      row.ownerId !== userId &&
      !row.group?.memberships.some((member) =>
        ["OWNER", "ADMIN"].includes(member.role),
      )
    )
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "BUDGET_NOT_FOUND",
        "Budget was not found",
      );
    return row;
  }
  private month(value: string) {
    const date = new Date(`${value}-01T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 7) !== value
    )
      throw this.conflict();
    return date;
  }
  private conflict() {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      "BUDGET_CONFLICT",
      "Budget configuration is invalid or conflicts with an active budget",
    );
  }
  private stale() {
    return new ApiException(
      HttpStatus.CONFLICT,
      "STALE_VERSION",
      "This budget changed; refresh and try again",
    );
  }

  private async mapUniqueConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw this.conflict();
      throw error;
    }
  }
}
