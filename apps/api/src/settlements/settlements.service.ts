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
import { parseMinorUnits, simplifyDebts } from "../expenses/domain";
import { CurrenciesService } from "../currencies/currencies.service";
import type {
  SettlementCorrectionDto,
  SettlementInputDto,
  SettlementPageQueryDto,
} from "./settlements.dto";
import {
  settlementError,
  settlementNotFound,
  staleSettlementVersion,
} from "./settlement-errors";

type Database = PrismaService | Prisma.TransactionClient;
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const userSelect = { id: true, name: true, avatarUrl: true } as const;
const revisionInclude = {
  actor: { select: userSelect },
  fromUser: { select: userSelect },
  toUser: { select: userSelect },
  exchangeRateSet: {
    include: { quotes: { orderBy: { quoteCurrency: "asc" as const } } },
  },
} as const;
const settlementInclude = {
  currentRevision: { include: revisionInclude },
  replacement: { select: { id: true } },
} as const;

@Injectable()
export class SettlementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CurrenciesService) private readonly currencies: CurrenciesService,
  ) {}

  async create(userId: string, key: string, input: SettlementInputDto) {
    this.requireIdempotencyKey(key);
    const hash = this.requestHash(input);
    let settlementId: string;
    try {
      settlementId = await this.prisma.withTransaction(async (database) => {
        const replay = await database.settlementIdempotency.findUnique({
          where: {
            actorId_operation_key: {
              actorId: userId,
              operation: "CREATE",
              key,
            },
          },
        });
        if (replay) {
          if (replay.requestHash !== hash) throw this.idempotencyConflict();
          return replay.settlementId;
        }
        const context = await this.requireContext(database, userId, input);
        const amountMinor = await this.prepareAmount(database, input, context);
        const settlement = await database.settlement.create({
          data: {
            creatorId: userId,
            groupId: context.groupId,
            friendshipId: context.friendshipId,
          },
        });
        const revision = await this.createActiveRevision(
          database,
          settlement.id,
          1,
          userId,
          input,
          amountMinor,
          "CREATED",
        );
        await database.settlement.update({
          where: { id: settlement.id },
          data: { currentRevisionId: revision.id },
        });
        await this.allocateSettlement(
          database,
          revision.id,
          context,
          input,
          amountMinor,
        );
        await database.settlementIdempotency.create({
          data: {
            actorId: userId,
            operation: "CREATE",
            key,
            requestHash: hash,
            settlementId: settlement.id,
          },
        });
        const payload = await this.activityPayload(database, input);
        await this.activities.record(database, {
          type: activityTypes.settlementCreated,
          actorId: userId,
          entityType: "SETTLEMENT",
          entityId: settlement.id,
          ...(context.groupId ? { groupId: context.groupId } : {}),
          ...(context.friendshipId
            ? { friendshipId: context.friendshipId }
            : {}),
          audienceUserIds: context.audienceUserIds,
          payload,
        });
        await this.audit.record(database, {
          actorId: userId,
          action: auditActions.settlementCreated,
          targetType: "SETTLEMENT",
          targetId: settlement.id,
        });
        return settlement.id;
      });
    } catch (error) {
      settlementId = await this.resolveIdempotencyRace(
        error,
        userId,
        "CREATE",
        key,
        hash,
      );
    }
    return this.detail(userId, settlementId);
  }

  async detail(userId: string, settlementId: string) {
    const row = await this.requireReadable(this.prisma, userId, settlementId);
    return this.present(row, userId);
  }

  async list(userId: string, query: SettlementPageQueryDto) {
    const limit = query.limit ?? 20;
    if (query.groupId && query.friendshipId) {
      throw settlementError(
        "INVALID_SETTLEMENT_FILTER",
        "Choose one settlement context",
      );
    }
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.settlement.findMany({
      where: {
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.friendshipId ? { friendshipId: query.friendshipId } : {}),
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
        AND: [
          {
            OR: [
              { currentRevision: { is: { fromUserId: userId } } },
              { currentRevision: { is: { toUserId: userId } } },
              { group: { memberships: { some: { userId, leftAt: null } } } },
            ],
          },
        ],
      },
      include: settlementInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.flatMap((row) =>
        row.currentRevision
          ? [this.present(row as PresentableSettlement, userId)]
          : [],
      ),
      nextCursor:
        rows.length > limit && last
          ? this.encodeCursor(last.updatedAt, last.id)
          : null,
    };
  }

  async revisions(
    userId: string,
    settlementId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const settlement = await this.requireReadable(
      this.prisma,
      userId,
      settlementId,
    );
    const revisionCursor = cursor
      ? this.decodeRevisionCursor(cursor)
      : undefined;
    const rows = await this.prisma.settlementRevision.findMany({
      where: {
        settlementId,
        ...(revisionCursor ? { revision: { lt: revisionCursor } } : {}),
      },
      include: revisionInclude,
      orderBy: { revision: "desc" },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((revision) => ({
        ...this.presentRevision(settlement, revision, userId),
        action: revision.action,
        revisionNumber: revision.revision,
      })),
      nextCursor:
        rows.length > limit ? String(rows[limit - 1]?.revision) : null,
    };
  }

  async reverse(
    userId: string,
    settlementId: string,
    version: number,
    reason: string,
  ) {
    await this.prisma.withTransaction(async (database) => {
      const settlement = await this.requireMutable(
        database,
        userId,
        settlementId,
        version,
      );
      const source = settlement.currentRevision;
      const revision = await database.settlementRevision.create({
        data: {
          settlementId,
          revision: version + 1,
          action: "REVERSED",
          actorId: userId,
          fromUserId: source.fromUserId,
          toUserId: source.toUserId,
          amountMinor: source.amountMinor,
          currency: source.currency,
          method: source.method,
          methodLabel: source.methodLabel,
          settledOn: source.settledOn,
          note: source.note,
          reversalReason: reason.trim(),
          exchangeRateSetId: source.exchangeRateSetId,
        },
      });
      const changed = await database.settlement.updateMany({
        where: { id: settlementId, version, status: "ACTIVE" },
        data: {
          version: { increment: 1 },
          status: "REVERSED",
          reversedAt: new Date(),
          currentRevisionId: revision.id,
        },
      });
      if (changed.count !== 1) throw staleSettlementVersion();
    });
    return this.detail(userId, settlementId);
  }

  async correct(
    userId: string,
    settlementId: string,
    version: number,
    key: string,
    input: SettlementCorrectionDto,
  ) {
    this.requireIdempotencyKey(key);
    const hash = this.requestHash({ settlementId, version, ...input });
    if (!input.replacement) {
      return this.reverseIdempotently(
        userId,
        settlementId,
        version,
        key,
        hash,
        input.reason,
      );
    }
    const replacementInput = input.replacement;
    let replacementId: string;
    try {
      replacementId = await this.prisma.withTransaction(async (database) => {
        const replay = await database.settlementIdempotency.findUnique({
          where: {
            actorId_operation_key: {
              actorId: userId,
              operation: "CORRECTION",
              key,
            },
          },
        });
        if (replay) {
          if (replay.requestHash !== hash) throw this.idempotencyConflict();
          return replay.settlementId;
        }
        const original = await this.requireMutable(
          database,
          userId,
          settlementId,
          version,
        );
        const context = await this.requireContext(
          database,
          userId,
          replacementInput,
        );
        if (
          context.groupId !== original.groupId ||
          context.friendshipId !== original.friendshipId ||
          replacementInput.fromUserId !== original.currentRevision.fromUserId ||
          replacementInput.toUserId !== original.currentRevision.toUserId
        ) {
          throw settlementError(
            "SETTLEMENT_CONTEXT_IMMUTABLE",
            "A correction must keep the same context and direction",
          );
        }
        const requested = this.validateInput(replacementInput);
        const outstanding = await this.outstanding(
          database,
          context,
          replacementInput,
        );
        const available =
          outstanding + BigInt(original.currentRevision.amountMinor.toString());
        if (requested > available) this.throwExceedsBalance();
        const reversal = await database.settlementRevision.create({
          data: {
            settlementId,
            revision: version + 1,
            action: "REVERSED",
            actorId: userId,
            fromUserId: original.currentRevision.fromUserId,
            toUserId: original.currentRevision.toUserId,
            amountMinor: original.currentRevision.amountMinor,
            currency: original.currentRevision.currency,
            method: original.currentRevision.method,
            methodLabel: original.currentRevision.methodLabel,
            settledOn: original.currentRevision.settledOn,
            note: original.currentRevision.note,
            reversalReason: input.reason.trim(),
            exchangeRateSetId: original.currentRevision.exchangeRateSetId,
          },
        });
        const changed = await database.settlement.updateMany({
          where: { id: settlementId, version, status: "ACTIVE" },
          data: {
            version: { increment: 1 },
            status: "REVERSED",
            reversedAt: new Date(),
            currentRevisionId: reversal.id,
          },
        });
        if (changed.count !== 1) throw staleSettlementVersion();
        const replacement = await database.settlement.create({
          data: {
            creatorId: userId,
            groupId: context.groupId,
            friendshipId: context.friendshipId,
            replacesSettlementId: settlementId,
          },
        });
        const revision = await this.createActiveRevision(
          database,
          replacement.id,
          1,
          userId,
          replacementInput,
          requested,
          "REPLACED",
        );
        await database.settlement.update({
          where: { id: replacement.id },
          data: { currentRevisionId: revision.id },
        });
        await this.allocateSettlement(
          database,
          revision.id,
          context,
          replacementInput,
          requested,
        );
        await database.settlementIdempotency.create({
          data: {
            actorId: userId,
            operation: "CORRECTION",
            key,
            requestHash: hash,
            settlementId: replacement.id,
          },
        });
        const payload = await this.activityPayload(database, replacementInput);
        await this.activities.record(database, {
          type: activityTypes.settlementReplaced,
          actorId: userId,
          entityType: "SETTLEMENT",
          entityId: replacement.id,
          ...(context.groupId ? { groupId: context.groupId } : {}),
          ...(context.friendshipId
            ? { friendshipId: context.friendshipId }
            : {}),
          audienceUserIds: context.audienceUserIds,
          payload: { ...payload, replacesSettlementId: settlementId },
        });
        await this.audit.record(database, {
          actorId: userId,
          action: auditActions.settlementReplaced,
          targetType: "SETTLEMENT",
          targetId: replacement.id,
        });
        return replacement.id;
      });
    } catch (error) {
      replacementId = await this.resolveIdempotencyRace(
        error,
        userId,
        "CORRECTION",
        key,
        hash,
      );
    }
    return this.detail(userId, replacementId);
  }

  private async reverseIdempotently(
    userId: string,
    settlementId: string,
    version: number,
    key: string,
    hash: string,
    reason: string,
  ) {
    let resultId: string;
    try {
      resultId = await this.prisma.withTransaction(async (database) => {
        const replay = await database.settlementIdempotency.findUnique({
          where: {
            actorId_operation_key: {
              actorId: userId,
              operation: "CORRECTION",
              key,
            },
          },
        });
        if (replay) {
          if (replay.requestHash !== hash) throw this.idempotencyConflict();
          return replay.settlementId;
        }
        const settlement = await this.requireMutable(
          database,
          userId,
          settlementId,
          version,
        );
        const source = settlement.currentRevision;
        const revision = await database.settlementRevision.create({
          data: {
            settlementId,
            revision: version + 1,
            action: "REVERSED",
            actorId: userId,
            fromUserId: source.fromUserId,
            toUserId: source.toUserId,
            amountMinor: source.amountMinor,
            currency: source.currency,
            method: source.method,
            methodLabel: source.methodLabel,
            settledOn: source.settledOn,
            note: source.note,
            reversalReason: reason.trim(),
            exchangeRateSetId: source.exchangeRateSetId,
          },
        });
        const changed = await database.settlement.updateMany({
          where: { id: settlementId, version, status: "ACTIVE" },
          data: {
            version: { increment: 1 },
            status: "REVERSED",
            reversedAt: new Date(),
            currentRevisionId: revision.id,
          },
        });
        if (changed.count !== 1) throw staleSettlementVersion();
        await database.settlementIdempotency.create({
          data: {
            actorId: userId,
            operation: "CORRECTION",
            key,
            requestHash: hash,
            settlementId,
          },
        });
        const context = await this.contextAudience(
          database,
          settlement.groupId,
          settlement.friendshipId,
        );
        await this.activities.record(database, {
          type: activityTypes.settlementReversed,
          actorId: userId,
          entityType: "SETTLEMENT",
          entityId: settlementId,
          ...(settlement.groupId ? { groupId: settlement.groupId } : {}),
          ...(settlement.friendshipId
            ? { friendshipId: settlement.friendshipId }
            : {}),
          audienceUserIds: context,
          payload: {
            amountMinor: source.amountMinor.toString(),
            currency: source.currency,
          },
        });
        await this.audit.record(database, {
          actorId: userId,
          action: auditActions.settlementReversed,
          targetType: "SETTLEMENT",
          targetId: settlementId,
        });
        return settlementId;
      });
    } catch (error) {
      resultId = await this.resolveIdempotencyRace(
        error,
        userId,
        "CORRECTION",
        key,
        hash,
      );
    }
    return this.detail(userId, resultId);
  }

  private async requireContext(
    database: Database,
    actorId: string,
    input: SettlementInputDto,
  ) {
    if (actorId !== input.fromUserId && actorId !== input.toUserId)
      throw settlementNotFound();
    if (input.fromUserId === input.toUserId) {
      throw settlementError(
        "INVALID_SETTLEMENT_DIRECTION",
        "Settlement users must differ",
      );
    }
    if (input.groupId) {
      const group = await database.group.findUnique({
        where: { id: input.groupId },
        select: {
          id: true,
          memberships: {
            where: { leftAt: null },
            select: { userId: true },
          },
        },
      });
      const activeUserIds = new Set(
        group?.memberships.map((row) => row.userId) ?? [],
      );
      if (
        !group ||
        !activeUserIds.has(input.fromUserId) ||
        !activeUserIds.has(input.toUserId)
      ) {
        throw settlementNotFound();
      }
      return {
        groupId: group.id,
        friendshipId: null,
        audienceUserIds: group.memberships.map((row) => row.userId),
      };
    }
    const friendship = await database.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { firstUserId: input.fromUserId, secondUserId: input.toUserId },
          { firstUserId: input.toUserId, secondUserId: input.fromUserId },
        ],
      },
      select: { id: true, firstUserId: true, secondUserId: true },
    });
    if (!friendship) throw settlementNotFound();
    return {
      groupId: null,
      friendshipId: friendship.id,
      audienceUserIds: [friendship.firstUserId, friendship.secondUserId],
    };
  }

  private async prepareAmount(
    database: Database,
    input: SettlementInputDto,
    context: { groupId: string | null; friendshipId: string | null },
  ) {
    const amount = this.validateInput(input);
    const outstanding = await this.outstanding(database, context, input);
    if (outstanding <= 0n) {
      throw settlementError(
        "NO_OUTSTANDING_BALANCE",
        "There is no balance in this direction",
      );
    }
    if (amount > outstanding) this.throwExceedsBalance();
    return amount;
  }

  private validateInput(input: SettlementInputDto): bigint {
    if (!isSupportedCurrencyCode(input.currency)) {
      throw settlementError("INVALID_CURRENCY", "Unsupported currency code");
    }
    if (input.method !== "OTHER" && input.methodLabel !== undefined) {
      throw settlementError(
        "INVALID_SETTLEMENT_METHOD",
        "A method label is only valid for OTHER",
      );
    }
    this.requireCalendarDate(input.settledOn);
    const amount = parseMinorUnits(input.amountMinor, { allowZero: false });
    if (amount > MAX_SIGNED_BIGINT) {
      throw settlementError(
        "INVALID_MINOR_UNITS",
        "Minor units exceed the supported range",
      );
    }
    return amount;
  }

  private async outstanding(
    database: Database,
    context: { groupId: string | null; friendshipId: string | null },
    input: SettlementInputDto,
  ): Promise<bigint> {
    if (context.groupId) {
      const group = await database.group.findUnique({
        where: { id: context.groupId },
        select: { simplifyDebtsEnabled: true },
      });
      if (group?.simplifyDebtsEnabled) {
        const entries = await database.$queryRaw<
          Array<{
            debtorId: string;
            creditorId: string;
            amountMinor: bigint;
            currency: string;
            sequence: number;
          }>
        >(Prisma.sql`
          SELECT le."debtorId", le."creditorId", le."amountMinor", le."currency", le."sequence"
          FROM "LedgerEntry" le
          JOIN "ExpenseRevision" revision ON revision."id" = le."revisionId"
          JOIN "Expense" expense ON expense."currentRevisionId" = revision."id" AND expense."status" = 'ACTIVE'
          WHERE expense."groupId" = CAST(${context.groupId} AS uuid) AND le."currency" = ${input.currency}
          UNION ALL
          SELECT le."debtorId", le."creditorId", le."amountMinor", le."currency", le."sequence"
          FROM "LedgerEntry" le
          JOIN "SettlementRevision" revision ON revision."id" = le."settlementRevisionId"
          JOIN "Settlement" settlement ON settlement."currentRevisionId" = revision."id" AND settlement."status" = 'ACTIVE'
          WHERE settlement."groupId" = CAST(${context.groupId} AS uuid) AND le."currency" = ${input.currency}
        `);
        return (
          simplifyDebts(
            entries.map((entry) => ({
              ...entry,
              amountMinor: BigInt(entry.amountMinor.toString()),
            })),
          ).find(
            (entry) =>
              entry.debtorId === input.fromUserId &&
              entry.creditorId === input.toUserId &&
              entry.currency === input.currency,
          )?.amountMinor ?? 0n
        );
      }
    }
    const rows = await database.$queryRaw<
      Array<{ netMinor: bigint }>
    >(Prisma.sql`
      WITH current_entries AS (
        SELECT le."debtorId", le."creditorId", le."amountMinor", le."currency",
               expense."groupId", expense."friendshipId"
        FROM "LedgerEntry" le
        JOIN "ExpenseRevision" revision ON revision."id" = le."revisionId"
        JOIN "Expense" expense ON expense."currentRevisionId" = revision."id" AND expense."status" = 'ACTIVE'
        WHERE le."sourceType" = 'EXPENSE_REVISION'
        UNION ALL
        SELECT le."debtorId", le."creditorId", le."amountMinor", le."currency",
               settlement."groupId", settlement."friendshipId"
        FROM "LedgerEntry" le
        JOIN "SettlementRevision" revision ON revision."id" = le."settlementRevisionId"
        JOIN "Settlement" settlement ON settlement."currentRevisionId" = revision."id" AND settlement."status" = 'ACTIVE'
        WHERE le."sourceType" = 'SETTLEMENT_REVISION'
      )
      SELECT COALESCE(SUM(
        CASE WHEN "creditorId" = CAST(${input.fromUserId} AS uuid) THEN "amountMinor" ELSE -"amountMinor" END
      ), 0) AS "netMinor"
      FROM current_entries
      WHERE "currency" = ${input.currency}
        AND (("debtorId" = CAST(${input.fromUserId} AS uuid) AND "creditorId" = CAST(${input.toUserId} AS uuid))
          OR ("debtorId" = CAST(${input.toUserId} AS uuid) AND "creditorId" = CAST(${input.fromUserId} AS uuid)))
        AND ${context.groupId}::uuid IS NOT DISTINCT FROM "groupId"
        AND ${context.friendshipId}::uuid IS NOT DISTINCT FROM "friendshipId"
    `);
    const net = BigInt((rows[0]?.netMinor ?? 0n).toString());
    return net < 0n ? -net : 0n;
  }

  private async createActiveRevision(
    database: Prisma.TransactionClient,
    settlementId: string,
    revision: number,
    actorId: string,
    input: SettlementInputDto,
    amountMinor: bigint,
    action: "CREATED" | "REPLACED",
  ) {
    const rates = await this.currencies.snapshotForWrite(
      database,
      actorId,
      input.currency,
      input.settledOn,
      input.valuationId,
    );
    return database.settlementRevision.create({
      data: {
        settlementId,
        revision,
        action,
        actorId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor,
        currency: input.currency,
        method: input.method,
        methodLabel: input.methodLabel?.trim() || null,
        settledOn: new Date(`${input.settledOn}T00:00:00.000Z`),
        note: input.note?.trim() || null,
        exchangeRateSetId: rates.id,
        ledgerEntries: {
          create: {
            sourceType: "SETTLEMENT_REVISION",
            sequence: 0,
            debtorId: input.toUserId,
            creditorId: input.fromUserId,
            amountMinor,
            currency: input.currency,
          },
        },
      },
    });
  }

  private async allocateSettlement(
    database: Prisma.TransactionClient,
    settlementRevisionId: string,
    context: { groupId: string | null; friendshipId: string | null },
    input: SettlementInputDto,
    amountMinor: bigint,
  ): Promise<void> {
    const expenses = await database.expense.findMany({
      where: {
        status: "ACTIVE",
        ...(context.groupId
          ? { groupId: context.groupId }
          : { friendshipId: context.friendshipId }),
        currentRevision: { currency: input.currency },
      },
      select: {
        id: true,
        createdAt: true,
        currentRevision: {
          select: {
            expenseDate: true,
            ledgerEntries: {
              select: {
                sequence: true,
                debtorId: true,
                creditorId: true,
                amountMinor: true,
              },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const existing = await database.settlementAllocation.groupBy({
      by: ["expenseId", "debtorId", "creditorId"],
      where: {
        currency: input.currency,
        expenseId: { in: expenses.map((row) => row.id) },
        settlementRevision: { currentFor: { is: { status: "ACTIVE" } } },
      },
      _sum: { amountMinor: true },
    });
    const used = new Map(
      existing.map((row) => [
        `${row.expenseId}:${row.debtorId}:${row.creditorId}`,
        row._sum.amountMinor ?? 0n,
      ]),
    );
    const edges = expenses
      .flatMap((expense) =>
        (expense.currentRevision?.ledgerEntries ?? []).map((entry) => {
          const already =
            used.get(`${expense.id}:${entry.debtorId}:${entry.creditorId}`) ??
            0n;
          return {
            expenseId: expense.id,
            debtorId: entry.debtorId,
            creditorId: entry.creditorId,
            remaining:
              entry.amountMinor > already ? entry.amountMinor - already : 0n,
            expenseDate: expense.currentRevision!.expenseDate,
            createdAt: expense.createdAt,
            sequence: entry.sequence,
          };
        }),
      )
      .filter((edge) => edge.remaining > 0n)
      .sort(
        (a, b) =>
          a.expenseDate.getTime() - b.expenseDate.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.sequence - b.sequence ||
          a.expenseId.localeCompare(b.expenseId),
      );

    let outstanding = amountMinor;
    let pathSequence = 0;
    const rows: Array<{
      settlementRevisionId: string;
      expenseId: string;
      pathSequence: number;
      edgeSequence: number;
      debtorId: string;
      creditorId: string;
      currency: string;
      amountMinor: bigint;
    }> = [];
    while (outstanding > 0n) {
      const path = this.findAllocationPath(
        edges,
        input.fromUserId,
        input.toUserId,
      );
      if (!path.length)
        throw settlementError(
          "SETTLEMENT_ALLOCATION_FAILED",
          "The settlement could not be matched to auditable obligations",
        );
      const amount = path.reduce(
        (value, edge) => (edge.remaining < value ? edge.remaining : value),
        outstanding,
      );
      path.forEach((edge, edgeSequence) => {
        edge.remaining -= amount;
        rows.push({
          settlementRevisionId,
          expenseId: edge.expenseId,
          pathSequence,
          edgeSequence,
          debtorId: edge.debtorId,
          creditorId: edge.creditorId,
          currency: input.currency,
          amountMinor: amount,
        });
      });
      outstanding -= amount;
      pathSequence += 1;
    }
    await database.settlementAllocation.createMany({ data: rows });
  }

  private findAllocationPath<
    T extends { debtorId: string; creditorId: string; remaining: bigint },
  >(edges: T[], from: string, to: string): T[] {
    const queue: Array<{ userId: string; path: T[] }> = [
      { userId: from, path: [] },
    ];
    const visited = new Set([from]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of edges) {
        if (
          edge.remaining <= 0n ||
          edge.debtorId !== current.userId ||
          current.path.includes(edge)
        )
          continue;
        const path = [...current.path, edge];
        if (edge.creditorId === to) return path;
        if (!visited.has(edge.creditorId)) {
          visited.add(edge.creditorId);
          queue.push({ userId: edge.creditorId, path });
        }
      }
    }
    return [];
  }

  private async requireReadable(
    database: Database,
    userId: string,
    settlementId: string,
  ) {
    const row = await database.settlement.findFirst({
      where: {
        id: settlementId,
        OR: [
          { currentRevision: { is: { fromUserId: userId } } },
          { currentRevision: { is: { toUserId: userId } } },
          { group: { memberships: { some: { userId, leftAt: null } } } },
        ],
      },
      include: settlementInclude,
    });
    if (!row?.currentRevision) throw settlementNotFound();
    return row as PresentableSettlement;
  }

  private async requireMutable(
    database: Prisma.TransactionClient,
    userId: string,
    settlementId: string,
    version: number,
  ) {
    const row = await database.settlement.findFirst({
      where: {
        id: settlementId,
        OR: [
          { currentRevision: { is: { fromUserId: userId } } },
          { currentRevision: { is: { toUserId: userId } } },
        ],
      },
      include: { currentRevision: true },
    });
    if (!row?.currentRevision) throw settlementNotFound();
    if (row.status !== "ACTIVE" || row.version !== version)
      throw staleSettlementVersion();
    return row as typeof row & {
      currentRevision: NonNullable<typeof row.currentRevision>;
    };
  }

  private present(row: PresentableSettlement, userId: string) {
    return this.presentRevision(row, row.currentRevision, userId);
  }

  private presentRevision(
    settlement: Pick<
      PresentableSettlement,
      | "id"
      | "groupId"
      | "friendshipId"
      | "status"
      | "version"
      | "replacesSettlementId"
      | "replacement"
      | "createdAt"
      | "updatedAt"
    >,
    revision: PresentableRevision,
    userId: string,
  ) {
    const canMutate =
      settlement.status === "ACTIVE" &&
      (revision.fromUserId === userId || revision.toUserId === userId);
    return {
      id: settlement.id,
      groupId: settlement.groupId,
      friendshipId: settlement.friendshipId,
      status: settlement.status,
      version: settlement.version,
      actor: revision.actor,
      from: revision.fromUser,
      to: revision.toUser,
      amountMinor: revision.amountMinor.toString(),
      currency: revision.currency,
      method: revision.method,
      methodLabel: revision.methodLabel,
      settledOn: revision.settledOn.toISOString().slice(0, 10),
      note: revision.note,
      reversalReason: revision.reversalReason,
      replacesSettlementId: settlement.replacesSettlementId,
      replacementSettlementId: settlement.replacement?.id ?? null,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      valuation: revision.exchangeRateSet
        ? {
            id: revision.exchangeRateSet.id,
            baseCurrency: revision.exchangeRateSet.baseCurrency,
            status: revision.exchangeRateSet.status,
            source: revision.exchangeRateSet.source,
            effectiveDate: revision.exchangeRateSet.effectiveDate
              .toISOString()
              .slice(0, 10),
            capturedAt: revision.exchangeRateSet.capturedAt,
            quotes: revision.exchangeRateSet.quotes,
          }
        : null,
      permissions: { canReverse: canMutate, canCorrect: canMutate },
    };
  }

  private requestHash(input: object): string {
    const canonicalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)]),
        );
      }
      return value;
    };
    return createHash("sha256")
      .update(JSON.stringify(canonicalize(input)))
      .digest("hex");
  }

  private requireIdempotencyKey(key: string) {
    if (!key || key.length > 128) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_REQUIRED",
        "A valid Idempotency-Key is required",
      );
    }
  }

  private idempotencyConflict() {
    return new ApiException(
      HttpStatus.CONFLICT,
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was used for another request",
    );
  }

  private async resolveIdempotencyRace(
    error: unknown,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
  ) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const replay = await this.prisma.settlementIdempotency.findUnique({
      where: { actorId_operation_key: { actorId, operation, key } },
    });
    if (!replay || replay.requestHash !== hash)
      throw this.idempotencyConflict();
    return replay.settlementId;
  }

  private throwExceedsBalance(): never {
    throw settlementError(
      "SETTLEMENT_EXCEEDS_BALANCE",
      "Settlement amount exceeds the outstanding balance",
    );
  }

  private requireCalendarDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw settlementError(
        "INVALID_SETTLEMENT_DATE",
        "Invalid settlement date",
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    if (value > today) {
      throw settlementError(
        "INVALID_SETTLEMENT_DATE",
        "Settlement date cannot be in the future",
      );
    }
  }

  private async activityPayload(
    database: Database,
    input: SettlementInputDto,
  ): Promise<Prisma.InputJsonObject> {
    const users = await database.user.findMany({
      where: { id: { in: [input.fromUserId, input.toUserId] } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((user) => [user.id, user.name]));
    return {
      fromUserId: input.fromUserId,
      fromName: names.get(input.fromUserId) ?? "A member",
      toUserId: input.toUserId,
      toName: names.get(input.toUserId) ?? "A member",
      amountMinor: input.amountMinor,
      currency: input.currency,
    };
  }

  private async contextAudience(
    database: Database,
    groupId: string | null,
    friendshipId: string | null,
  ): Promise<string[]> {
    if (groupId) {
      const members = await database.groupMember.findMany({
        where: { groupId, leftAt: null },
        select: { userId: true },
      });
      return members.map((member) => member.userId);
    }
    if (friendshipId) {
      const friendship = await database.friendship.findUnique({
        where: { id: friendshipId },
        select: { firstUserId: true, secondUserId: true },
      });
      return friendship
        ? [friendship.firstUserId, friendship.secondUserId]
        : [];
    }
    return [];
  }

  private encodeCursor(updatedAt: Date, id: string) {
    return Buffer.from(
      JSON.stringify({ updatedAt: updatedAt.toISOString(), id }),
      "utf8",
    ).toString("base64url");
  }

  private decodeCursor(value: string): { updatedAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as {
        updatedAt: string;
        id: string;
      };
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
      throw settlementError("INVALID_CURSOR", "Invalid cursor");
    }
  }

  private decodeRevisionCursor(value: string): number {
    if (!/^[1-9]\d*$/.test(value))
      throw settlementError("INVALID_CURSOR", "Invalid cursor");
    const result = Number(value);
    if (!Number.isSafeInteger(result))
      throw settlementError("INVALID_CURSOR", "Invalid cursor");
    return result;
  }
}

type PresentableRevision = Prisma.SettlementRevisionGetPayload<{
  include: typeof revisionInclude;
}>;
type PresentableSettlement = Prisma.SettlementGetPayload<{
  include: typeof settlementInclude;
}> & { currentRevision: PresentableRevision };
