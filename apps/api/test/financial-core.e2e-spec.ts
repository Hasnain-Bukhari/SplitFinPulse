import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/application";
import { GoogleOidcService } from "../src/auth/google-oidc.service";
import { PrismaService } from "../src/database/prisma.service";
import { deleteTraceRecords } from "./test-cleanup";

interface TestSession {
  userId: string;
  cookies: string;
  csrf: string;
}
const runId = randomUUID();
const profiles = {
  first: {
    subject: `finance-first-${runId}`,
    email: `finance-first-${runId}@example.com`,
    name: "Finance First",
  },
  second: {
    subject: `finance-second-${runId}`,
    email: `finance-second-${runId}@example.com`,
    name: "Finance Second",
  },
} as const;

describe("financial core", () => {
  let application: NestExpressApplication;
  let prisma: PrismaService;
  let first: TestSession;
  let second: TestSession;
  let friendshipId: string;
  let groupId: string | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOidcService)
      .useValue({
        authorizationUrl: ({ state }: { state: string }) =>
          `https://accounts.test/authorize?state=${encodeURIComponent(state)}`,
        exchangeCode: (
          code: keyof typeof profiles,
          _verifier: string,
          nonce: string,
        ) =>
          Promise.resolve({
            ...profiles[code],
            emailVerified: true,
            avatarUrl: null,
            nonce,
          }),
      })
      .compile();
    application = module.createNestApplication<NestExpressApplication>();
    configureApplication(application);
    await application.init();
    prisma = application.get(PrismaService);
    first = await signIn("first");
    second = await signIn("second");
    const friendship = await authenticated(
      first,
      "post",
      "/api/v1/friends/requests",
    )
      .send({ userId: second.userId })
      .expect(201);
    friendshipId = friendship.body.friendshipId as string;
    await authenticated(
      second,
      "post",
      `/api/v1/friends/requests/${friendshipId}/accept`,
    ).expect(201);
  });

  afterAll(async () => {
    const userIds = [first?.userId, second?.userId].filter(
      (value): value is string => Boolean(value),
    );
    if (userIds.length) {
      await deleteTraceRecords(prisma, userIds);
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Settlement" DISABLE TRIGGER USER; ALTER TABLE "SettlementRevision" DISABLE TRIGGER USER; ALTER TABLE "LedgerEntry" DISABLE TRIGGER USER',
      );
      try {
        const settlements = await prisma.settlement.findMany({
          where: { creatorId: { in: userIds } },
          select: { id: true },
        });
        const settlementIds = settlements.map((row) => row.id);
        const revisions = await prisma.settlementRevision.findMany({
          where: { settlementId: { in: settlementIds } },
          select: { id: true },
        });
        const revisionIds = revisions.map((row) => row.id);
        await prisma.settlementIdempotency.deleteMany({
          where: { settlementId: { in: settlementIds } },
        });
        await prisma.settlement.updateMany({
          where: { id: { in: settlementIds } },
          data: { currentRevisionId: null },
        });
        await prisma.ledgerEntry.deleteMany({
          where: { settlementRevisionId: { in: revisionIds } },
        });
        await prisma.settlementRevision.deleteMany({
          where: { id: { in: revisionIds } },
        });
        await prisma.settlement.deleteMany({
          where: { id: { in: settlementIds } },
        });
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "LedgerEntry" ENABLE TRIGGER USER; ALTER TABLE "SettlementRevision" ENABLE TRIGGER USER; ALTER TABLE "Settlement" ENABLE TRIGGER USER',
        );
      }
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Expense" DISABLE TRIGGER USER',
      );
      try {
        await prisma.expense.updateMany({
          where: { creatorId: { in: userIds } },
          data: { currentRevisionId: null },
        });
        const expenses = await prisma.expense.findMany({
          where: { creatorId: { in: userIds } },
          select: { id: true },
        });
        const expenseIds = expenses.map((row) => row.id);
        await prisma.expenseComment.deleteMany({
          where: { expenseId: { in: expenseIds } },
        });
        const revisions = await prisma.expenseRevision.findMany({
          where: { expenseId: { in: expenseIds } },
          select: { id: true },
        });
        const revisionIds = revisions.map((row) => row.id);
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "ExpenseRevision" DISABLE TRIGGER USER; ALTER TABLE "ExpensePayer" DISABLE TRIGGER USER; ALTER TABLE "ExpenseSplit" DISABLE TRIGGER USER; ALTER TABLE "LedgerEntry" DISABLE TRIGGER USER',
        );
        await prisma.expenseIdempotency.deleteMany({
          where: { expenseId: { in: expenseIds } },
        });
        await prisma.ledgerEntry.deleteMany({
          where: { expenseRevisionId: { in: revisionIds } },
        });
        await prisma.expensePayer.deleteMany({
          where: { revisionId: { in: revisionIds } },
        });
        await prisma.expenseSplit.deleteMany({
          where: { revisionId: { in: revisionIds } },
        });
        await prisma.expenseRevision.deleteMany({
          where: { id: { in: revisionIds } },
        });
        await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "LedgerEntry" ENABLE TRIGGER USER; ALTER TABLE "ExpenseSplit" ENABLE TRIGGER USER; ALTER TABLE "ExpensePayer" ENABLE TRIGGER USER; ALTER TABLE "ExpenseRevision" ENABLE TRIGGER USER; ALTER TABLE "Expense" ENABLE TRIGGER USER',
        );
      }
      if (groupId) {
        await prisma.groupInvitation.deleteMany({ where: { groupId } });
        await prisma.groupMember.deleteMany({ where: { groupId } });
        await prisma.group.delete({ where: { id: groupId } });
      }
      await prisma.friendship.deleteMany({ where: { id: friendshipId } });
      await prisma.authSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.authIdentity.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await application.close();
  });

  it("creates an idempotent multi-payer expense and projects delete/restore balances", async () => {
    const input = {
      friendshipId,
      description: "Dinner",
      totalMinor: "100",
      currency: "USD",
      expenseDate: "2026-08-17",
      splitMethod: "EQUAL",
      payers: [
        { userId: first.userId, amountMinor: "60" },
        { userId: second.userId, amountMinor: "40" },
      ],
      participants: [{ userId: first.userId }, { userId: second.userId }],
    };
    const created = await authenticated(first, "post", "/api/v1/expenses")
      .set("Idempotency-Key", "dinner-create")
      .send(input)
      .expect(201);
    expect(created.body).toMatchObject({
      description: "Dinner",
      version: 1,
      status: "ACTIVE",
    });
    expect(created.body.ledgerEntries).toEqual([
      expect.objectContaining({
        debtorId: second.userId,
        creditorId: first.userId,
        amountMinor: "10",
      }),
    ]);
    const replay = await authenticated(first, "post", "/api/v1/expenses")
      .set("Idempotency-Key", "dinner-create")
      .send(input)
      .expect(201);
    expect(replay.body.id).toBe(created.body.id);
    await authenticated(first, "post", "/api/v1/expenses")
      .set("Idempotency-Key", "dinner-create")
      .send({ ...input, description: "Changed" })
      .expect(409);
    await authenticated(
      first,
      "patch",
      `/api/v1/expenses/${created.body.id as string}`,
    )
      .set("If-Match", "0")
      .send(input)
      .expect(412);
    const before = await authenticated(
      second,
      "get",
      "/api/v1/balances",
    ).expect(200);
    expect(before.body.totals).toContainEqual(
      expect.objectContaining({ currency: "USD", netMinor: "-10" }),
    );
    const removed = await authenticated(
      first,
      "delete",
      `/api/v1/expenses/${created.body.id as string}`,
    )
      .set("If-Match", "1")
      .expect(200);
    expect(removed.body).toMatchObject({ status: "DELETED", version: 2 });
    expect(
      (await authenticated(second, "get", "/api/v1/balances").expect(200)).body
        .totals,
    ).toEqual([]);
    const restored = await authenticated(
      first,
      "post",
      `/api/v1/expenses/${created.body.id as string}/restore`,
    )
      .set("If-Match", "2")
      .expect(200);
    expect(restored.body).toMatchObject({ status: "ACTIVE", version: 3 });

    const concurrent = await Promise.all([
      authenticated(
        first,
        "patch",
        `/api/v1/expenses/${created.body.id as string}`,
      )
        .set("If-Match", "3")
        .send({ ...input, description: "Concurrent A" }),
      authenticated(
        first,
        "patch",
        `/api/v1/expenses/${created.body.id as string}`,
      )
        .set("If-Match", "3")
        .send({ ...input, description: "Concurrent B" }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 412,
    ]);

    const concurrentDelete = await Promise.all([
      authenticated(
        first,
        "delete",
        `/api/v1/expenses/${created.body.id as string}`,
      ).set("If-Match", "4"),
      authenticated(
        first,
        "delete",
        `/api/v1/expenses/${created.body.id as string}`,
      ).set("If-Match", "4"),
    ]);
    expect(concurrentDelete.map((response) => response.status).sort()).toEqual([
      200, 412,
    ]);

    const concurrentRestore = await Promise.all([
      authenticated(
        first,
        "post",
        `/api/v1/expenses/${created.body.id as string}/restore`,
      ).set("If-Match", "5"),
      authenticated(
        first,
        "post",
        `/api/v1/expenses/${created.body.id as string}/restore`,
      ).set("If-Match", "5"),
    ]);
    expect(concurrentRestore.map((response) => response.status).sort()).toEqual(
      [200, 412],
    );
  });

  it("rejects missing and arbitrary current ledger output in PostgreSQL", async () => {
    const current = await prisma.expense.findFirstOrThrow({
      where: { creatorId: first.userId, status: "ACTIVE" },
    });
    await expect(
      prisma.$transaction(async (database) => {
        await database.ledgerEntry.create({
          data: {
            expenseRevisionId: current.currentRevisionId!,
            sourceType: "EXPENSE_REVISION",
            sequence: 99,
            debtorId: second.userId,
            creditorId: first.userId,
            amountMinor: 1n,
            currency: "USD",
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (database) => {
        const expense = await database.expense.create({
          data: { creatorId: first.userId, friendshipId },
        });
        const revision = await database.expenseRevision.create({
          data: {
            expenseId: expense.id,
            revision: 1,
            action: "CREATED",
            actorId: first.userId,
            description: "Missing ledger",
            totalMinor: 100n,
            currency: "USD",
            expenseDate: new Date("2026-08-17T00:00:00.000Z"),
            splitMethod: "EQUAL",
            payers: {
              create: [{ userId: first.userId, amountMinor: 100n }],
            },
            splits: {
              create: [
                { userId: first.userId, amountMinor: 50n },
                { userId: second.userId, amountMinor: 50n },
              ],
            },
          },
        });
        await database.expense.update({
          where: { id: expense.id },
          data: { currentRevisionId: revision.id },
        });
      }),
    ).rejects.toThrow();
  });

  it("aggregates totals in PostgreSQL while paging contexts", async () => {
    const group = await authenticated(first, "post", "/api/v1/groups")
      .send({
        name: "Financial pagination",
        type: "OTHER",
        defaultCurrency: "THB",
      })
      .expect(201);
    groupId = group.body.id as string;
    await authenticated(first, "post", `/api/v1/groups/${groupId}/members`)
      .send({ userId: second.userId })
      .expect(201);
    await authenticated(first, "post", "/api/v1/expenses")
      .set("Idempotency-Key", "group-pagination-expense")
      .send({
        groupId,
        description: "Group meal",
        totalMinor: "200",
        currency: "THB",
        expenseDate: "2026-08-17",
        splitMethod: "EQUAL",
        payers: [{ userId: first.userId, amountMinor: "200" }],
        participants: [{ userId: first.userId }, { userId: second.userId }],
      })
      .expect(201);

    const firstPage = await authenticated(
      first,
      "get",
      "/api/v1/balances?limit=1",
    ).expect(200);
    expect(firstPage.body.contexts).toHaveLength(1);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));
    expect(firstPage.body.totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: "USD" }),
        expect.objectContaining({ currency: "THB" }),
      ]),
    );
    const secondPage = await authenticated(
      first,
      "get",
      `/api/v1/balances?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor as string)}`,
    );
    expect(
      secondPage.status,
      `${String(firstPage.body.nextCursor)} ${JSON.stringify(secondPage.body)}`,
    ).toBe(200);
    expect(secondPage.body.contexts).toHaveLength(1);
    expect(secondPage.body.contexts[0].contextId).not.toBe(
      firstPage.body.contexts[0].contextId,
    );
    expect(secondPage.body.nextCursor).toBeNull();
    expect(secondPage.body.totals).toEqual(firstPage.body.totals);
  });

  it("records, reverses, and traces a settlement while emitting activity and supporting comments", async () => {
    const before = await authenticated(
      second,
      "get",
      "/api/v1/balances",
    ).expect(200);
    const owedBefore = before.body.totals.find(
      (item: { currency: string }) => item.currency === "USD",
    );
    expect(owedBefore.netMinor).toBe("-10");
    const input = {
      fromUserId: second.userId,
      toUserId: first.userId,
      amountMinor: "4",
      currency: "USD",
      method: "BANK_TRANSFER",
      settledOn: "2026-08-20",
      note: "Manual transfer",
    };
    const created = await authenticated(second, "post", "/api/v1/settlements")
      .set("Idempotency-Key", "partial-settlement")
      .send(input)
      .expect(201);
    expect(created.body).toMatchObject({
      amountMinor: "4",
      status: "ACTIVE",
      version: 1,
    });
    const replay = await authenticated(second, "post", "/api/v1/settlements")
      .set("Idempotency-Key", "partial-settlement")
      .send(input)
      .expect(201);
    expect(replay.body.id).toBe(created.body.id);
    await authenticated(second, "post", "/api/v1/settlements")
      .set("Idempotency-Key", "overpayment")
      .send({ ...input, amountMinor: "7" })
      .expect(400);
    const after = await authenticated(second, "get", "/api/v1/balances").expect(
      200,
    );
    expect(
      after.body.totals.find(
        (item: { currency: string }) => item.currency === "USD",
      ).netMinor,
    ).toBe("-6");
    const breakdown = await authenticated(
      second,
      "get",
      `/api/v1/balances/breakdown?friendshipId=${friendshipId}`,
    ).expect(200);
    expect(breakdown.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "SETTLEMENT" }),
      ]),
    );
    await authenticated(
      second,
      "post",
      `/api/v1/settlements/${created.body.id as string}/corrections`,
    )
      .set("If-Match", '"1"')
      .set("Idempotency-Key", "reverse-partial")
      .send({ reason: "Entered for testing" })
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({ status: "REVERSED", version: 2 }),
      );
    const restored = await authenticated(
      second,
      "get",
      "/api/v1/balances",
    ).expect(200);
    expect(
      restored.body.totals.find(
        (item: { currency: string }) => item.currency === "USD",
      ).netMinor,
    ).toBe("-10");

    const incorrect = await authenticated(second, "post", "/api/v1/settlements")
      .set("Idempotency-Key", "incorrect-settlement")
      .send({ ...input, amountMinor: "3" })
      .expect(201);
    const replacement = await authenticated(
      first,
      "post",
      `/api/v1/settlements/${incorrect.body.id as string}/corrections`,
    )
      .set("If-Match", '"1"')
      .set("Idempotency-Key", "replace-incorrect")
      .send({
        reason: "Amount was wrong",
        replacement: { ...input, amountMinor: "2" },
      })
      .expect(200);
    expect(replacement.body).toMatchObject({
      status: "ACTIVE",
      replacesSettlementId: incorrect.body.id,
      amountMinor: "2",
    });
    const original = await authenticated(
      first,
      "get",
      `/api/v1/settlements/${incorrect.body.id as string}`,
    ).expect(200);
    expect(original.body.replacementSettlementId).toBe(replacement.body.id);
    const replacementHistory = await authenticated(
      first,
      "get",
      `/api/v1/settlements/${replacement.body.id as string}/revisions`,
    ).expect(200);
    expect(replacementHistory.body.items[0].action).toBe("REPLACED");
    await authenticated(
      second,
      "post",
      `/api/v1/settlements/${incorrect.body.id as string}/corrections`,
    )
      .set("If-Match", '"1"')
      .set("Idempotency-Key", "stale-correction")
      .send({ reason: "Stale request" })
      .expect(412);

    const concurrent = await Promise.all([
      authenticated(second, "post", "/api/v1/settlements")
        .set("Idempotency-Key", "concurrent-settlement-a")
        .send({ ...input, amountMinor: "6" }),
      authenticated(second, "post", "/api/v1/settlements")
        .set("Idempotency-Key", "concurrent-settlement-b")
        .send({ ...input, amountMinor: "6" }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    const concurrentBalance = await authenticated(
      second,
      "get",
      "/api/v1/balances",
    ).expect(200);
    expect(
      concurrentBalance.body.totals.find(
        (item: { currency: string }) => item.currency === "USD",
      ).netMinor,
    ).toBe("-2");
    await authenticated(second, "post", "/api/v1/settlements")
      .set("Idempotency-Key", "full-final-settlement")
      .send({ ...input, amountMinor: "2" })
      .expect(201);
    const fullySettled = await authenticated(
      second,
      "get",
      "/api/v1/balances",
    ).expect(200);
    expect(
      fullySettled.body.totals.some(
        (item: { currency: string }) => item.currency === "USD",
      ),
    ).toBe(false);

    const expense = await prisma.expense.findFirstOrThrow({
      where: { creatorId: first.userId, status: "ACTIVE", friendshipId },
    });
    const comment = await authenticated(
      first,
      "post",
      `/api/v1/expenses/${expense.id}/comments`,
    )
      .send({ body: "Looks correct" })
      .expect(201);
    await authenticated(
      second,
      "patch",
      `/api/v1/expenses/${expense.id}/comments/${comment.body.id as string}`,
    )
      .set("If-Match", "1")
      .send({ body: "Cannot edit" })
      .expect(404);
    await authenticated(
      first,
      "delete",
      `/api/v1/expenses/${expense.id}/comments/${comment.body.id as string}`,
    )
      .set("If-Match", "1")
      .expect(200)
      .expect((response) => expect(response.body.body).toBeNull());

    const activity = await authenticated(
      first,
      "get",
      "/api/v1/activities",
    ).expect(200);
    expect(
      activity.body.items.map((item: { type: string }) => item.type),
    ).toEqual(
      expect.arrayContaining([
        "SETTLEMENT_CREATED",
        "SETTLEMENT_REVERSED",
        "SETTLEMENT_REPLACED",
        "COMMENT_CREATED",
        "COMMENT_DELETED",
      ]),
    );
    expect(JSON.stringify(activity.body.items)).not.toContain(
      "Manual transfer",
    );
    expect(JSON.stringify(activity.body.items)).not.toContain("Looks correct");
    expect(
      activity.body.items.filter(
        (item: { type: string; entityId: string }) =>
          item.type === "SETTLEMENT_CREATED" &&
          item.entityId === created.body.id,
      ),
    ).toHaveLength(1);
    const eventId = activity.body.items[0].id as string;
    await expect(
      prisma.activityEvent.update({
        where: { id: eventId },
        data: { type: "TAMPERED" },
      }),
    ).rejects.toThrow();
    const audience = await prisma.activityAudience.findFirstOrThrow({
      where: { eventId },
    });
    await expect(
      prisma.activityAudience.update({
        where: { id: audience.id },
        data: { createdAt: new Date() },
      }),
    ).rejects.toThrow();
    const security = await authenticated(
      first,
      "get",
      "/api/v1/users/me/security-events",
    ).expect(200);
    expect(security.body.items).toEqual(expect.any(Array));
    const otherSecurity = await authenticated(
      second,
      "get",
      "/api/v1/users/me/security-events",
    ).expect(200);
    const otherIds = new Set(
      otherSecurity.body.items.map((item: { id: string }) => item.id),
    );
    expect(
      security.body.items.some((item: { id: string }) => otherIds.has(item.id)),
    ).toBe(false);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { actorId: first.userId },
    });
    await expect(
      prisma.auditEvent.update({
        where: { id: audit.id },
        data: { outcome: "DENIED" },
      }),
    ).rejects.toThrow();
  });

  it("validates every split mode, malformed cursors, and publishes financial paths", async () => {
    const base = {
      friendshipId,
      description: "Preview",
      totalMinor: "100",
      currency: "USD",
      expenseDate: "2026-08-17",
      payers: [{ userId: first.userId, amountMinor: "100" }],
    };
    for (const [splitMethod, participants] of [
      ["EQUAL", [{ userId: first.userId }, { userId: second.userId }]],
      [
        "EXACT",
        [
          { userId: first.userId, input: "50" },
          { userId: second.userId, input: "50" },
        ],
      ],
      [
        "PERCENTAGE",
        [
          { userId: first.userId, input: "50" },
          { userId: second.userId, input: "50" },
        ],
      ],
      [
        "SHARES",
        [
          { userId: first.userId, input: "1" },
          { userId: second.userId, input: "3" },
        ],
      ],
    ] as const) {
      await authenticated(first, "post", "/api/v1/expenses/preview")
        .send({ ...base, splitMethod, participants })
        .expect(200);
    }
    await authenticated(first, "get", "/api/v1/expenses?cursor=invalid").expect(
      400,
    );
    await authenticated(
      first,
      "get",
      "/api/v1/settlements?cursor=invalid",
    ).expect(400);
    await authenticated(
      first,
      "get",
      "/api/v1/activities?cursor=invalid",
    ).expect(400);
    await authenticated(
      first,
      "get",
      "/api/v1/users/me/security-events?cursor=invalid",
    ).expect(400);
    await authenticated(
      first,
      "get",
      "/api/v1/expenses?dateFrom=2026-02-30",
    ).expect(400);
    const malformedBreakdownCursor = Buffer.from(
      JSON.stringify({ updatedAt: new Date().toISOString(), id: "not-a-uuid" }),
      "utf8",
    ).toString("base64url");
    await authenticated(
      first,
      "get",
      `/api/v1/balances/breakdown?cursor=${malformedBreakdownCursor}`,
    ).expect(400);
    const openapi = await request(application.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    expect(openapi.body.paths).toHaveProperty("/api/v1/expenses/preview");
    expect(openapi.body.paths).toHaveProperty(
      "/api/v1/expenses/{expenseId}/restore",
    );
    expect(openapi.body.paths).toHaveProperty(
      "/api/v1/balances/groups/{groupId}",
    );
    expect(openapi.body.paths).toHaveProperty("/api/v1/settlements");
    expect(openapi.body.paths).toHaveProperty("/api/v1/activities");
    expect(openapi.body.paths).toHaveProperty(
      "/api/v1/groups/{groupId}/activities",
    );
    expect(openapi.body.paths).toHaveProperty(
      "/api/v1/expenses/{expenseId}/comments",
    );
    expect(openapi.body.paths).toHaveProperty(
      "/api/v1/users/me/security-events",
    );
    expect(
      openapi.body.components.schemas.ExpenseInputDto.properties.payers.items
        .$ref,
    ).toContain("ExpensePayerDto");
    expect(
      openapi.body.paths["/api/v1/expenses"].post.responses["201"].content[
        "application/json"
      ].schema.$ref,
    ).toContain("ExpenseDetailResponseDto");
    expect(
      openapi.body.paths["/api/v1/balances"].get.responses["200"].content[
        "application/json"
      ].schema.$ref,
    ).toContain("OverallBalancesResponseDto");
    expect(
      openapi.body.components.schemas.BalanceBreakdownPageResponseDto.properties
        .items.items.discriminator.propertyName,
    ).toBe("sourceType");
  });

  async function signIn(profile: keyof typeof profiles): Promise<TestSession> {
    const start = await request(application.getHttpServer())
      .get("/api/v1/auth/google/start?returnTo=/balances")
      .expect(302);
    const state = new URL(start.headers.location as string).searchParams.get(
      "state",
    )!;
    const callback = await request(application.getHttpServer())
      .get(
        `/api/v1/auth/google/callback?code=${profile}&state=${encodeURIComponent(state)}`,
      )
      .expect(302);
    const cookieHeaders = callback.headers["set-cookie"] as unknown as string[];
    const cookies = cookieHeaders
      .map((value) => value.split(";")[0])
      .join("; ");
    const csrf = cookieHeaders
      .find((value) => value.startsWith("sfp_csrf="))!
      .split(";")[0]!
      .split("=")[1]!;
    const session = await request(application.getHttpServer())
      .get("/api/v1/auth/session")
      .set("cookie", cookies)
      .expect(200);
    return { userId: session.body.user.id as string, cookies, csrf };
  }

  function authenticated(
    session: TestSession,
    method: "get" | "post" | "patch" | "delete",
    path: string,
  ) {
    return request(application.getHttpServer())
      [method](path)
      .set("cookie", session.cookies)
      .set("origin", "http://localhost:5173")
      .set("x-csrf-token", session.csrf);
  }
});
