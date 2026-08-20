import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
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

const profiles = {
  alice: {
    subject: "friends-alice",
    email: "friends-alice@example.com",
    name: "Alice Friend",
  },
  bob: {
    subject: "friends-bob",
    email: "friends-bob@example.com",
    name: "Bob Friend",
  },
  carol: {
    subject: "friends-carol",
    email: "friends-carol@example.com",
    name: "Carol Friend",
  },
} as const;

describe("friends and invitations", () => {
  let application: NestExpressApplication;
  let prisma: PrismaService;
  let alice: TestSession;
  let bob: TestSession;
  let carol: TestSession;

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
    alice = await signIn("alice");
    bob = await signIn("bob");
    carol = await signIn("carol");
  });

  afterAll(async () => {
    const userIds = [alice?.userId, bob?.userId, carol?.userId].filter(
      (value): value is string => Boolean(value),
    );
    if (userIds.length) {
      await deleteTraceRecords(prisma, userIds);
      await prisma.friendInvitation.deleteMany({
        where: {
          OR: [
            { inviterId: { in: userIds } },
            { acceptedById: { in: userIds } },
          ],
        },
      });
      await prisma.friendship.deleteMany({
        where: {
          OR: [
            { firstUserId: { in: userIds } },
            { secondUserId: { in: userIds } },
          ],
        },
      });
      await prisma.accountLifecycleEvent.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.deletedAuthIdentity.deleteMany({
        where: { userId: { in: userIds } },
      });
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

  it("discovers by exact email and completes authorized idempotent transitions", async () => {
    const discovery = await authenticated(
      alice,
      "get",
      "/api/v1/friends/discovery?email=FRIENDS-BOB%40EXAMPLE.COM",
    ).expect(200);
    expect(discovery.body).toMatchObject({
      user: { id: bob.userId, name: "Bob Friend" },
      relationship: null,
    });

    const created = await authenticated(
      alice,
      "post",
      "/api/v1/friends/requests",
    )
      .send({ userId: bob.userId })
      .expect(201);
    const friendshipId = created.body.friendshipId as string;
    expect(created.body).toMatchObject({
      status: "PENDING",
      direction: "outgoing",
    });

    const reverse = await authenticated(bob, "post", "/api/v1/friends/requests")
      .send({ userId: alice.userId })
      .expect(201);
    expect(reverse.body.friendshipId).toBe(friendshipId);
    expect(reverse.body.direction).toBe("incoming");

    await authenticated(
      alice,
      "post",
      `/api/v1/friends/requests/${friendshipId}/accept`,
    ).expect(403);
    const accepted = await authenticated(
      bob,
      "post",
      `/api/v1/friends/requests/${friendshipId}/accept`,
    ).expect(201);
    expect(accepted.body.status).toBe("ACCEPTED");
    await authenticated(
      bob,
      "post",
      `/api/v1/friends/requests/${friendshipId}/accept`,
    ).expect(201);

    const friends = await authenticated(alice, "get", "/api/v1/friends").expect(
      200,
    );
    expect(friends.body.items).toHaveLength(1);
    expect(friends.body.items[0].user.id).toBe(bob.userId);

    await authenticated(
      alice,
      "delete",
      `/api/v1/friends/${friendshipId}`,
    ).expect(204);
    await authenticated(
      alice,
      "delete",
      `/api/v1/friends/${friendshipId}`,
    ).expect(204);

    await authenticated(alice, "post", "/api/v1/friends/requests")
      .send({ userId: bob.userId })
      .expect(201);
    await authenticated(
      bob,
      "post",
      `/api/v1/friends/requests/${friendshipId}/decline`,
    ).expect(201);
    const reactivated = await authenticated(
      alice,
      "post",
      "/api/v1/friends/requests",
    )
      .send({ userId: bob.userId })
      .expect(201);
    expect(reactivated.body).toMatchObject({ friendshipId, status: "PENDING" });
  });

  it("rejects self-discovery and does not expose inactive accounts", async () => {
    await authenticated(
      alice,
      "get",
      "/api/v1/friends/discovery?email=friends-alice%40example.com",
    ).expect(400);
    await prisma.user.update({
      where: { id: carol.userId },
      data: { status: "DEACTIVATED" },
    });
    await authenticated(
      alice,
      "get",
      "/api/v1/friends/discovery?email=friends-carol%40example.com",
    ).expect(404);
    await prisma.user.update({
      where: { id: carol.userId },
      data: { status: "ACTIVE" },
    });
  });

  it("converges concurrent opposite requests on one canonical pair", async () => {
    const [fromBob, fromCarol] = await Promise.all([
      authenticated(bob, "post", "/api/v1/friends/requests").send({
        userId: carol.userId,
      }),
      authenticated(carol, "post", "/api/v1/friends/requests").send({
        userId: bob.userId,
      }),
    ]);
    expect(fromBob.status).toBe(201);
    expect(fromCarol.status).toBe(201);
    expect(fromBob.body.friendshipId).toBe(fromCarol.body.friendshipId);
    expect(
      await prisma.friendship.count({
        where: {
          OR: [
            { firstUserId: bob.userId, secondUserId: carol.userId },
            { firstUserId: carol.userId, secondUserId: bob.userId },
          ],
        },
      }),
    ).toBe(1);
  });

  it("creates, previews, consumes, and safely rejects replayed invitations", async () => {
    const created = await authenticated(
      alice,
      "post",
      "/api/v1/friend-invitations",
    ).expect(201);
    const inviteUrl = new URL(created.body.inviteUrl as string);
    const token = inviteUrl.pathname.split("/").at(-1)!;

    const preview = await request(application.getHttpServer())
      .get(`/api/v1/friend-invitations/${token}`)
      .expect(200);
    expect(preview.body).toMatchObject({
      status: "ACTIVE",
      inviter: { name: "Alice Friend" },
    });

    const accepted = await authenticated(
      carol,
      "post",
      `/api/v1/friend-invitations/${token}/accept`,
    ).expect(201);
    expect(accepted.body).toMatchObject({
      status: "ACCEPTED",
      user: { id: alice.userId },
    });
    await authenticated(
      carol,
      "post",
      `/api/v1/friend-invitations/${token}/accept`,
    ).expect(201);

    const replay = await authenticated(
      bob,
      "post",
      `/api/v1/friend-invitations/${token}/accept`,
    ).expect(410);
    expect(replay.body).toMatchObject({
      code: "INVITE_ALREADY_USED",
      path: "/api/v1/friend-invitations/:token/accept",
    });

    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const invalid = await request(application.getHttpServer())
      .get(`/api/v1/friend-invitations/${tampered}`)
      .expect(404);
    expect(invalid.body).toMatchObject({
      code: "INVITE_INVALID",
      path: "/api/v1/friend-invitations/:token",
    });

    const selfInvite = await authenticated(
      alice,
      "post",
      "/api/v1/friend-invitations",
    ).expect(201);
    const selfToken = new URL(selfInvite.body.inviteUrl as string).pathname
      .split("/")
      .at(-1)!;
    await authenticated(
      alice,
      "post",
      `/api/v1/friend-invitations/${selfToken}/accept`,
    ).expect(400);
    expect(
      await prisma.friendInvitation.findFirstOrThrow({
        where: { inviterId: alice.userId },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({ consumedAt: null });

    const expiredInvite = await authenticated(
      alice,
      "post",
      "/api/v1/friend-invitations",
    ).expect(201);
    const expiredToken = new URL(
      expiredInvite.body.inviteUrl as string,
    ).pathname
      .split("/")
      .at(-1)!;
    const latest = await prisma.friendInvitation.findFirstOrThrow({
      where: { inviterId: alice.userId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    await prisma.friendInvitation.update({
      where: { id: latest.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expiredPreview = await request(application.getHttpServer())
      .get(`/api/v1/friend-invitations/${expiredToken}`)
      .expect(200);
    expect(expiredPreview.body.status).toBe("EXPIRED");
    await authenticated(
      bob,
      "post",
      `/api/v1/friend-invitations/${expiredToken}/accept`,
    ).expect(410);
  });

  it("publishes the friends and invitation OpenAPI paths", async () => {
    const response = await request(application.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    expect(response.body.paths).toHaveProperty("/api/v1/friends");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/friend-invitations/{token}",
    );
  });

  it("exports friendship data and safely disconnects a deleted account", async () => {
    const exported = await authenticated(
      alice,
      "post",
      "/api/v1/users/me/export",
    ).expect(200);
    expect(exported.body.friendships.length).toBeGreaterThan(0);
    expect(exported.body.friendInvitations.created.length).toBeGreaterThan(0);

    const invitation = await authenticated(
      carol,
      "post",
      "/api/v1/friend-invitations",
    ).expect(201);
    const invitationId = await prisma.friendInvitation.findFirstOrThrow({
      where: { inviterId: carol.userId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    await authenticated(carol, "delete", "/api/v1/users/me")
      .send({ confirmation: "DELETE" })
      .expect(204);

    expect(
      await prisma.friendship.count({
        where: {
          status: { not: "REMOVED" },
          OR: [{ firstUserId: carol.userId }, { secondUserId: carol.userId }],
        },
      }),
    ).toBe(0);
    expect(
      await prisma.friendInvitation.findUniqueOrThrow({
        where: { id: invitationId.id },
      }),
    ).toMatchObject({ revokedAt: expect.any(Date) });
    expect(invitation.body.inviteUrl).toContain("/invite/");
  });

  async function signIn(profile: keyof typeof profiles): Promise<TestSession> {
    const start = await request(application.getHttpServer())
      .get("/api/v1/auth/google/start?returnTo=/friends")
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
    method: "get" | "post" | "delete",
    path: string,
  ) {
    return request(application.getHttpServer())
      [method](path)
      .set("cookie", session.cookies)
      .set("origin", "http://localhost:5173")
      .set("x-csrf-token", session.csrf);
  }
});
