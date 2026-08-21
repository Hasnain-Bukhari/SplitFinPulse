import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { isSupportedCurrencyCode } from "../currencies/currency-codes";
import { ApiException } from "../http/api.exception";
import type { SpendingAnalyticsQueryDto } from "./analytics.dto";

type Bucket = {
  id: string | null;
  name: string;
  icon?: string | null;
  expenseIds: Set<string>;
  yourShare: bigint;
  wholeExpense: bigint;
};

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async spending(userId: string, query: SpendingAnalyticsQueryDto) {
    const range = this.range(query.dateFrom, query.dateTo);
    if (!isSupportedCurrencyCode(query.currency))
      throw this.invalidRange("Unsupported currency");
    const expenses = await this.prisma.expense.findMany({
      where: {
        status: "ACTIVE",
        currentRevision: {
          currency: query.currency,
          expenseDate: {
            gte: new Date(`${query.dateFrom}T00:00:00.000Z`),
            lte: new Date(`${query.dateTo}T00:00:00.000Z`),
          },
          splits: { some: { userId } },
        },
      },
      select: {
        id: true,
        groupId: true,
        group: { select: { name: true } },
        currentRevision: {
          select: {
            totalMinor: true,
            expenseDate: true,
            categoryId: true,
            categoryName: true,
            categoryIcon: true,
            splits: {
              select: {
                userId: true,
                amountMinor: true,
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
      },
      orderBy: [{ currentRevision: { expenseDate: "asc" } }, { id: "asc" }],
    });
    const currencies = await this.prisma.$queryRaw<
      Array<{ currency: string }>
    >(Prisma.sql`
      SELECT DISTINCT revision.currency
      FROM "Expense" expense
      JOIN "ExpenseRevision" revision ON expense."currentRevisionId" = revision.id
      JOIN "ExpenseSplit" split ON split."revisionId" = revision.id AND split."userId" = ${userId}::uuid
      WHERE expense.status = 'ACTIVE' AND revision."expenseDate" BETWEEN ${new Date(`${query.dateFrom}T00:00:00.000Z`)} AND ${new Date(`${query.dateTo}T00:00:00.000Z`)}
      ORDER BY revision.currency
    `);
    const months = new Map<
      string,
      {
        month: string;
        expenseIds: Set<string>;
        yourShare: bigint;
        wholeExpense: bigint;
      }
    >();
    for (
      let month = range.start.with({ day: 1 });
      Temporal.PlainDate.compare(month, range.end) <= 0;
      month = month.add({ months: 1 })
    ) {
      const key = month.toString().slice(0, 7);
      months.set(key, {
        month: key,
        expenseIds: new Set(),
        yourShare: 0n,
        wholeExpense: 0n,
      });
    }
    const category = new Map<string, Bucket>();
    const group = new Map<string, Bucket>();
    const people = new Map<
      string,
      {
        id: string;
        name: string;
        avatarUrl: string | null;
        expenseIds: Set<string>;
        share: bigint;
      }
    >();
    let yourShare = 0n;
    let wholeExpense = 0n;
    for (const expense of expenses) {
      const revision = expense.currentRevision;
      if (!revision) continue;
      const own =
        revision.splits.find((split) => split.userId === userId)?.amountMinor ??
        0n;
      yourShare += own;
      wholeExpense += revision.totalMinor;
      const month = months.get(revision.expenseDate.toISOString().slice(0, 7));
      if (month) {
        month.expenseIds.add(expense.id);
        month.yourShare += own;
        month.wholeExpense += revision.totalMinor;
      }
      this.addBucket(
        category,
        revision.categoryId ?? "__uncategorized",
        {
          id: revision.categoryId,
          name: revision.categoryName ?? "Uncategorized",
          icon: revision.categoryIcon,
        },
        expense.id,
        own,
        revision.totalMinor,
      );
      this.addBucket(
        group,
        expense.groupId ?? "__outside",
        { id: expense.groupId, name: expense.group?.name ?? "Outside groups" },
        expense.id,
        own,
        revision.totalMinor,
      );
      for (const split of revision.splits) {
        const current = people.get(split.userId) ?? {
          ...split.user,
          expenseIds: new Set<string>(),
          share: 0n,
        };
        current.expenseIds.add(expense.id);
        current.share += split.amountMinor;
        people.set(split.userId, current);
      }
    }
    return {
      range: { dateFrom: query.dateFrom, dateTo: query.dateTo },
      currency: query.currency,
      metric: query.metric,
      availableCurrencies: currencies.map((row) => row.currency),
      summary: {
        expenseCount: expenses.length,
        yourShareMinor: yourShare.toString(),
        wholeExpenseMinor: wholeExpense.toString(),
      },
      months: [...months.values()].map((item) => ({
        month: item.month,
        expenseCount: item.expenseIds.size,
        yourShareMinor: item.yourShare.toString(),
        wholeExpenseMinor: item.wholeExpense.toString(),
      })),
      categories: this.rankBuckets(category, query.metric, query.limit),
      groups: this.rankBuckets(group, query.metric, query.limit),
      people: this.rankPeople(people, query.limit),
    };
  }

  private range(from: string, to: string) {
    try {
      const start = Temporal.PlainDate.from(from);
      const end = Temporal.PlainDate.from(to);
      const days = start.until(end, { largestUnit: "day" }).days;
      if (days < 0 || days > 365) throw new Error();
      return { start, end };
    } catch {
      throw this.invalidRange("Choose a valid range of at most 366 days");
    }
  }

  private addBucket(
    map: Map<string, Bucket>,
    key: string,
    identity: { id: string | null; name: string; icon?: string | null },
    expenseId: string,
    own: bigint,
    total: bigint,
  ) {
    const row = map.get(key) ?? {
      ...identity,
      expenseIds: new Set<string>(),
      yourShare: 0n,
      wholeExpense: 0n,
    };
    row.expenseIds.add(expenseId);
    row.yourShare += own;
    row.wholeExpense += total;
    map.set(key, row);
  }

  private rankBuckets(
    map: Map<string, Bucket>,
    metric: "YOUR_SHARE" | "WHOLE_EXPENSE",
    limit: number,
  ) {
    const sorted = [...map.values()].sort(
      (a, b) =>
        this.compare(
          metric === "YOUR_SHARE" ? a.yourShare : a.wholeExpense,
          metric === "YOUR_SHARE" ? b.yourShare : b.wholeExpense,
        ) || a.name.localeCompare(b.name),
    );
    const present = (row: Bucket) => ({
      id: row.id,
      name: row.name,
      ...(row.icon !== undefined ? { icon: row.icon } : {}),
      expenseCount: row.expenseIds.size,
      yourShareMinor: row.yourShare.toString(),
      wholeExpenseMinor: row.wholeExpense.toString(),
    });
    const hidden = sorted.slice(limit);
    const other = hidden.length
      ? hidden.reduce(
          (sum, row) => ({
            id: null,
            name: "Other",
            expenseIds: new Set([...sum.expenseIds, ...row.expenseIds]),
            yourShare: sum.yourShare + row.yourShare,
            wholeExpense: sum.wholeExpense + row.wholeExpense,
          }),
          {
            id: null,
            name: "Other",
            expenseIds: new Set<string>(),
            yourShare: 0n,
            wholeExpense: 0n,
          } as Bucket,
        )
      : null;
    return {
      items: sorted.slice(0, limit).map(present),
      other: other ? present(other) : null,
    };
  }

  private rankPeople(
    map: Map<
      string,
      {
        id: string;
        name: string;
        avatarUrl: string | null;
        expenseIds: Set<string>;
        share: bigint;
      }
    >,
    limit: number,
  ) {
    const sorted = [...map.values()].sort(
      (a, b) => this.compare(a.share, b.share) || a.name.localeCompare(b.name),
    );
    const hidden = sorted.slice(limit);
    return {
      items: sorted.slice(0, limit).map((row) => ({
        user: { id: row.id, name: row.name, avatarUrl: row.avatarUrl },
        expenseCount: row.expenseIds.size,
        shareMinor: row.share.toString(),
      })),
      other: hidden.length
        ? {
            expenseCount: new Set(hidden.flatMap((row) => [...row.expenseIds]))
              .size,
            shareMinor: hidden
              .reduce((sum, row) => sum + row.share, 0n)
              .toString(),
          }
        : null,
    };
  }

  private compare(a: bigint, b: bigint) {
    return a === b ? 0 : a > b ? -1 : 1;
  }
  private invalidRange(message: string) {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      "INVALID_ANALYTICS_RANGE",
      message,
    );
  }
}
