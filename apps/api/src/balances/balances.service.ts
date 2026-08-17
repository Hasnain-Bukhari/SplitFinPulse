import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { calculateNetPositions, simplifyDebts } from "../expenses/domain";
import { expenseNotFound, financialError } from "../expenses/expense-errors";
import type { BalanceBreakdownQueryDto } from "./balances.dto";

type Entry = {
  id: string;
  debtorId: string;
  creditorId: string;
  amountMinor: bigint;
  currency: string;
  revision: {
    expense: {
      id: string;
      groupId: string | null;
      friendshipId: string | null;
    };
    description: string;
    expenseDate: Date;
  };
};

@Injectable()
export class BalancesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overall(userId: string, cursor: string | undefined, limit: number) {
    const offset = cursor ? this.decodeOffsetCursor(cursor) : 0;
    const pageLimit = Number(limit);
    type TotalRow = {
      currency: string;
      youOweMinor: bigint;
      youAreOwedMinor: bigint;
      netMinor: bigint;
    };
    type ContextRow = TotalRow & {
      contextType: "GROUP" | "FRIENDSHIP";
      contextId: string;
      name: string;
      rank: bigint;
      totalContexts: bigint;
    };
    const [totalRows, contextRows] = await Promise.all([
      this.prisma.$queryRaw<TotalRow[]>`
        SELECT le."currency",
          SUM(CASE WHEN le."debtorId" = CAST(${userId} AS uuid) THEN le."amountMinor" ELSE 0 END) AS "youOweMinor",
          SUM(CASE WHEN le."creditorId" = CAST(${userId} AS uuid) THEN le."amountMinor" ELSE 0 END) AS "youAreOwedMinor",
          SUM(CASE WHEN le."creditorId" = CAST(${userId} AS uuid) THEN le."amountMinor" ELSE -le."amountMinor" END) AS "netMinor"
        FROM "LedgerEntry" le
        JOIN "ExpenseRevision" revision ON revision."id" = le."revisionId"
        JOIN "Expense" expense ON expense."currentRevisionId" = revision."id" AND expense."status" = 'ACTIVE'
        WHERE le."debtorId" = CAST(${userId} AS uuid) OR le."creditorId" = CAST(${userId} AS uuid)
        GROUP BY le."currency"
        ORDER BY le."currency"
      `,
      this.prisma.$queryRaw<ContextRow[]>`
        WITH current_entries AS (
          SELECT le."currency", le."debtorId", le."creditorId", le."amountMinor",
            CASE WHEN expense."groupId" IS NOT NULL THEN 'GROUP' ELSE 'FRIENDSHIP' END AS context_type,
            COALESCE(expense."groupId", expense."friendshipId") AS context_id
          FROM "LedgerEntry" le
          JOIN "ExpenseRevision" revision ON revision."id" = le."revisionId"
          JOIN "Expense" expense ON expense."currentRevisionId" = revision."id" AND expense."status" = 'ACTIVE'
          WHERE le."debtorId" = CAST(${userId} AS uuid) OR le."creditorId" = CAST(${userId} AS uuid)
        ), contexts AS (
          SELECT DISTINCT context_type, context_id FROM current_entries
        ), numbered AS (
          SELECT context_type, context_id,
            ROW_NUMBER() OVER (ORDER BY context_type, context_id) AS rank,
            COUNT(*) OVER () AS total_contexts
          FROM contexts
        ), selected AS (
          SELECT * FROM numbered
          WHERE rank > ${offset} AND rank <= ${offset + pageLimit}
        )
        SELECT selected.context_type AS "contextType", selected.context_id AS "contextId",
          COALESCE(group_row."name", CASE WHEN friendship."firstUserId" = CAST(${userId} AS uuid) THEN second_user."name" ELSE first_user."name" END, 'Unknown') AS "name",
          entries."currency",
          SUM(CASE WHEN entries."debtorId" = CAST(${userId} AS uuid) THEN entries."amountMinor" ELSE 0 END) AS "youOweMinor",
          SUM(CASE WHEN entries."creditorId" = CAST(${userId} AS uuid) THEN entries."amountMinor" ELSE 0 END) AS "youAreOwedMinor",
          SUM(CASE WHEN entries."creditorId" = CAST(${userId} AS uuid) THEN entries."amountMinor" ELSE -entries."amountMinor" END) AS "netMinor",
          selected.rank AS "rank", selected.total_contexts AS "totalContexts"
        FROM selected
        JOIN current_entries entries ON entries.context_type = selected.context_type AND entries.context_id = selected.context_id
        LEFT JOIN "Group" group_row ON selected.context_type = 'GROUP' AND group_row."id" = selected.context_id
        LEFT JOIN "Friendship" friendship ON selected.context_type = 'FRIENDSHIP' AND friendship."id" = selected.context_id
        LEFT JOIN "User" first_user ON first_user."id" = friendship."firstUserId"
        LEFT JOIN "User" second_user ON second_user."id" = friendship."secondUserId"
        GROUP BY selected.context_type, selected.context_id, selected.rank, selected.total_contexts,
          group_row."name", friendship."firstUserId", first_user."name", second_user."name", entries."currency"
        ORDER BY selected.rank, entries."currency"
      `,
    ]);
    const contexts = new Map<
      string,
      {
        contextType: "GROUP" | "FRIENDSHIP";
        contextId: string;
        name: string;
        amounts: Array<{
          currency: string;
          youOweMinor: string;
          youAreOwedMinor: string;
          netMinor: string;
        }>;
      }
    >();
    for (const row of contextRows) {
      const key = `${row.contextType}:${row.contextId}`;
      const context = contexts.get(key) ?? {
        contextType: row.contextType,
        contextId: row.contextId,
        name: row.name,
        amounts: [],
      };
      context.amounts.push({
        currency: row.currency,
        youOweMinor: row.youOweMinor.toString(),
        youAreOwedMinor: row.youAreOwedMinor.toString(),
        netMinor: row.netMinor.toString(),
      });
      contexts.set(key, context);
    }
    const totalContexts = Number(contextRows[0]?.totalContexts ?? 0n);
    return {
      totals: totalRows.map((row) => ({
        currency: row.currency,
        youOweMinor: row.youOweMinor.toString(),
        youAreOwedMinor: row.youAreOwedMinor.toString(),
        netMinor: row.netMinor.toString(),
      })),
      contexts: [...contexts.values()],
      nextCursor:
        offset + pageLimit < totalContexts
          ? Buffer.from(String(offset + pageLimit), "utf8").toString(
              "base64url",
            )
          : null,
    };
  }

  async group(userId: string, groupId: string) {
    await this.requireGroupRead(userId, groupId);
    const [group, entries] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: {
          simplifyDebtsEnabled: true,
          defaultCurrency: true,
          memberships: {
            where: { leftAt: null },
            select: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.currentEntries({ revision: { expense: { groupId } } }),
    ]);
    if (!group) throw expenseNotFound();
    const transfers = this.aggregateTransfers(entries);
    const userIds = [
      ...new Set(transfers.flatMap((row) => [row.debtorId, row.creditorId])),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    for (const membership of group.memberships) {
      if (!users.some((user) => user.id === membership.user.id)) {
        users.push(membership.user);
      }
    }
    const byId = new Map(users.map((user) => [user.id, user]));
    const positions = calculateNetPositions(transfers).map((row) => ({
      user: byId.get(row.userId)!,
      currency: row.currency,
      netMinor: row.netMinor.toString(),
    }));
    const positionKeys = new Set(
      positions.map((position) => `${position.currency}:${position.user.id}`),
    );
    const currencies = [
      ...new Set([
        ...entries.map((entry) => entry.currency),
        group.defaultCurrency,
      ]),
    ].sort();
    for (const membership of group.memberships) {
      for (const currency of currencies) {
        if (!positionKeys.has(`${currency}:${membership.user.id}`)) {
          positions.push({ user: membership.user, currency, netMinor: "0" });
        }
      }
    }
    positions.sort(
      (left, right) =>
        left.currency.localeCompare(right.currency) ||
        left.user.id.localeCompare(right.user.id),
    );
    const simplified = simplifyDebts(transfers);
    const presentTransfer = (row: {
      debtorId: string;
      creditorId: string;
      amountMinor: bigint;
      currency: string;
    }) => ({
      from: byId.get(row.debtorId)!,
      to: byId.get(row.creditorId)!,
      amountMinor: row.amountMinor.toString(),
      currency: row.currency,
    });
    return {
      groupId,
      simplifyDebtsEnabled: group.simplifyDebtsEnabled,
      currentUser: this.userSummaries(userId, entries),
      positions,
      rawObligations: transfers.map(presentTransfer),
      recommendations: simplified.map(presentTransfer),
    };
  }

  async friend(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        OR: [{ firstUserId: userId }, { secondUserId: userId }],
      },
    });
    if (!friendship) throw expenseNotFound();
    const entries = await this.currentEntries({
      revision: { expense: { friendshipId } },
    });
    const counterpartyId =
      friendship.firstUserId === userId
        ? friendship.secondUserId
        : friendship.firstUserId;
    const friend = await this.prisma.user.findUniqueOrThrow({
      where: { id: counterpartyId },
      select: { id: true, name: true, avatarUrl: true },
    });
    return {
      friendshipId,
      friend,
      amounts: this.userSummaries(userId, entries),
    };
  }

  async breakdown(userId: string, query: BalanceBreakdownQueryDto) {
    if (query.groupId) await this.requireGroupRead(userId, query.groupId);
    if (query.friendshipId) {
      const friendship = await this.prisma.friendship.findFirst({
        where: {
          id: query.friendshipId,
          OR: [{ firstUserId: userId }, { secondUserId: userId }],
        },
      });
      if (!friendship) throw expenseNotFound();
    }
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.expense.findMany({
      where: {
        status: "ACTIVE",
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.friendshipId ? { friendshipId: query.friendshipId } : {}),
        currentRevision: {
          ...(query.currency ? { currency: query.currency } : {}),
          ledgerEntries: {
            some: {
              OR: [{ debtorId: userId }, { creditorId: userId }],
              ...(query.counterpartyId
                ? {
                    OR: [
                      { debtorId: userId, creditorId: query.counterpartyId },
                      { debtorId: query.counterpartyId, creditorId: userId },
                    ],
                  }
                : {}),
            },
          },
        },
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        currentRevision: {
          include: {
            ledgerEntries: {
              where: { OR: [{ debtorId: userId }, { creditorId: userId }] },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const selected = rows.slice(0, query.limit);
    const counterpartIds = [
      ...new Set(
        selected
          .flatMap(
            (expense) =>
              expense.currentRevision?.ledgerEntries.flatMap((entry) => [
                entry.debtorId,
                entry.creditorId,
              ]) ?? [],
          )
          .filter((id) => id !== userId),
      ),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: counterpartIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    const items = selected.flatMap(
      (expense) =>
        expense.currentRevision?.ledgerEntries.flatMap((entry) => {
          if (
            query.counterpartyId &&
            entry.debtorId !== query.counterpartyId &&
            entry.creditorId !== query.counterpartyId
          )
            return [];
          const counterpartyId =
            entry.debtorId === userId ? entry.creditorId : entry.debtorId;
          return [
            {
              expense: {
                id: expense.id,
                description: expense.currentRevision!.description,
                totalMinor: expense.currentRevision!.totalMinor.toString(),
                currency: expense.currentRevision!.currency,
                expenseDate: expense
                  .currentRevision!.expenseDate.toISOString()
                  .slice(0, 10),
                status: expense.status,
                groupId: expense.groupId,
                friendshipId: expense.friendshipId,
                version: expense.version,
                createdAt: expense.createdAt,
                updatedAt: expense.updatedAt,
              },
              amountMinor: entry.amountMinor.toString(),
              direction: entry.debtorId === userId ? "OWE" : "OWED",
              counterparty: byId.get(counterpartyId)!,
            },
          ];
        }) ?? [],
    );
    const last = selected.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? this.encodeCursor(last.updatedAt, last.id)
          : null,
    };
  }

  async hasNonZeroGroupPosition(
    database: Pick<PrismaService, "ledgerEntry">,
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    const entries = await database.ledgerEntry.findMany({
      where: {
        revision: { currentFor: { is: { status: "ACTIVE", groupId } } },
        OR: [{ debtorId: userId }, { creditorId: userId }],
      },
      select: {
        debtorId: true,
        creditorId: true,
        amountMinor: true,
        currency: true,
      },
    });
    const byCurrency = new Map<string, bigint>();
    for (const row of entries) {
      byCurrency.set(
        row.currency,
        (byCurrency.get(row.currency) ?? 0n) +
          (row.creditorId === userId ? row.amountMinor : -row.amountMinor),
      );
    }
    return [...byCurrency.values()].some((net) => net !== 0n);
  }

  private currentEntries(extraWhere: object): Promise<Entry[]> {
    return this.prisma.ledgerEntry.findMany({
      where: {
        AND: [
          { revision: { currentFor: { is: { status: "ACTIVE" } } } },
          extraWhere,
        ],
      },
      include: {
        revision: {
          select: {
            description: true,
            expenseDate: true,
            expense: {
              select: { id: true, groupId: true, friendshipId: true },
            },
          },
        },
      },
      orderBy: [{ currency: "asc" }, { sequence: "asc" }, { id: "asc" }],
    });
  }

  private userSummaries(userId: string, entries: readonly Entry[]) {
    const rows = new Map<string, { owe: bigint; owed: bigint }>();
    for (const entry of entries) {
      const value = rows.get(entry.currency) ?? { owe: 0n, owed: 0n };
      if (entry.debtorId === userId) value.owe += entry.amountMinor;
      if (entry.creditorId === userId) value.owed += entry.amountMinor;
      rows.set(entry.currency, value);
    }
    return [...rows]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => ({
        currency,
        youOweMinor: value.owe.toString(),
        youAreOwedMinor: value.owed.toString(),
        netMinor: (value.owed - value.owe).toString(),
      }));
  }

  private aggregateTransfers(entries: readonly Entry[]) {
    const rows = new Map<
      string,
      {
        debtorId: string;
        creditorId: string;
        currency: string;
        amountMinor: bigint;
      }
    >();
    for (const entry of entries) {
      const key = `${entry.currency}:${entry.debtorId}:${entry.creditorId}`;
      const existing = rows.get(key);
      rows.set(key, {
        debtorId: entry.debtorId,
        creditorId: entry.creditorId,
        currency: entry.currency,
        amountMinor: (existing?.amountMinor ?? 0n) + entry.amountMinor,
      });
    }
    return [...rows.values()]
      .sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          a.debtorId.localeCompare(b.debtorId) ||
          a.creditorId.localeCompare(b.creditorId),
      )
      .map((row, sequence) => ({ ...row, sequence }));
  }

  private async requireGroupRead(userId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        memberships: { some: { userId } },
      },
      include: {
        memberships: { where: { userId, leftAt: null }, select: { id: true } },
      },
    });
    if (!group) throw expenseNotFound();
    if (group.memberships.length > 0) return;
    const hasBalance = await this.hasNonZeroGroupPosition(
      this.prisma,
      groupId,
      userId,
    );
    if (!hasBalance) throw expenseNotFound();
  }

  private encodeCursor(updatedAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ updatedAt: updatedAt.toISOString(), id }),
      "utf8",
    ).toString("base64url");
  }

  private decodeCursor(value: string): { updatedAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as { updatedAt: string; id: string };
      const updatedAt = new Date(parsed.updatedAt);
      if (
        Number.isNaN(updatedAt.getTime()) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parsed.id,
        )
      )
        throw new Error();
      return { updatedAt, id: parsed.id };
    } catch {
      throw financialError("INVALID_CURSOR", "Invalid cursor");
    }
  }

  private decodeOffsetCursor(value: string): number {
    try {
      const decoded = Buffer.from(value, "base64url").toString("utf8");
      if (!/^(?:0|[1-9]\d*)$/.test(decoded)) throw new Error();
      const offset = Number(decoded);
      if (!Number.isSafeInteger(offset)) throw new Error();
      return offset;
    } catch {
      throw financialError("INVALID_CURSOR", "Invalid cursor");
    }
  }
}
