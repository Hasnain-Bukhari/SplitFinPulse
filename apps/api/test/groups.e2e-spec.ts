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

const testRunId = randomUUID();
const profiles = {
  owner: {
    subject: `groups-owner-${testRunId}`,
    email: `groups-owner-${testRunId}@example.com`,
    name: "Group Owner",
  },
  admin: {
    subject: `groups-admin-${testRunId}`,
    email: `groups-admin-${testRunId}@example.com`,
    name: "Group Admin",
  },
  invitee: {
    subject: `groups-invitee-${testRunId}`,
    email: `groups-invitee-${testRunId}@example.com`,
    name: "Group Invitee",
  },
  secondInvitee: {
    subject: `groups-second-invitee-${testRunId}`,
    email: `groups-second-invitee-${testRunId}@example.com`,
    name: "Second Group Invitee",
  },
} as const;

describe("groups and memberships", () => {
  let application: NestExpressApplication;
  let prisma: PrismaService;
  let owner: TestSession;
  let admin: TestSession;
  let invitee: TestSession;
  let secondInvitee: TestSession;

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
    owner = await signIn("owner");
    admin = await signIn("admin");
    invitee = await signIn("invitee");
    secondInvitee = await signIn("secondInvitee");

    await becomeFriends(owner, admin);
    await becomeFriends(secondInvitee, admin);
  });

  afterAll(async () => {
    const userIds = [
      owner?.userId,
      admin?.userId,
      invitee?.userId,
      secondInvitee?.userId,
    ].filter((value): value is string => Boolean(value));
    if (userIds.length) {
      await deleteTraceRecords(prisma, userIds);
      // Group records are removed first because users are intentionally retained
      // by foreign keys while membership history exists.
      await prisma.$transaction([
        prisma.groupInvitation.deleteMany({
          where: {
            group: { memberships: { some: { userId: { in: userIds } } } },
          },
        }),
        prisma.groupMember.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.group.deleteMany({
          where: { memberships: { none: {} } },
        }),
      ]);
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

  it("creates, lists, reads, and edits a group with an owner membership", async () => {
    const created = await createGroup(owner, "Bangkok Weekend");
    expect(created.body).toMatchObject({
      name: "Bangkok Weekend",
      type: "TRIP",
      defaultCurrency: "THB",
      simplifyDebtsEnabled: true,
      status: "ACTIVE",
      currentUserRole: "OWNER",
    });
    expect(created.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ id: owner.userId }),
          role: "OWNER",
          leftAt: null,
        }),
      ]),
    );

    const groupId = created.body.id as string;
    const listed = await authenticated(owner, "get", "/api/v1/groups").expect(
      200,
    );
    expect(listed.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: groupId,
          memberCount: 1,
          currentUserRole: "OWNER",
        }),
      ]),
    );

    const updated = await authenticated(
      owner,
      "patch",
      `/api/v1/groups/${groupId}`,
    )
      .send({ name: "Bangkok and Ayutthaya", simplifyDebtsEnabled: false })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: groupId,
      name: "Bangkok and Ayutthaya",
      simplifyDebtsEnabled: false,
    });

    await authenticated(invitee, "get", `/api/v1/groups/${groupId}`).expect(
      404,
    );
    await authenticated(invitee, "patch", `/api/v1/groups/${groupId}`)
      .send({ name: "Unauthorized rename" })
      .expect(404);
  });

  it("enforces direct-add friendship, role, and ownership boundaries", async () => {
    const created = await createGroup(owner, "Role Boundaries");
    const groupId = created.body.id as string;

    await authenticated(owner, "post", `/api/v1/groups/${groupId}/members`)
      .send({ userId: invitee.userId })
      .expect(403);

    const added = await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/members`,
    )
      .send({ userId: admin.userId })
      .expect(201);
    expect(added.body).toMatchObject({
      user: { id: admin.userId },
      role: "MEMBER",
      leftAt: null,
    });
    const membershipId = added.body.membershipId as string;
    const ownerMembershipId = created.body.members.find(
      (member: { user: { id: string } }) => member.user.id === owner.userId,
    ).membershipId as string;

    const promoted = await authenticated(
      owner,
      "patch",
      `/api/v1/groups/${groupId}/members/${membershipId}`,
    )
      .send({ role: "ADMIN" })
      .expect(200);
    expect(promoted.body.role).toBe("ADMIN");

    await authenticated(admin, "patch", `/api/v1/groups/${groupId}`)
      .send({ name: "Role Boundaries Updated" })
      .expect(200);
    await authenticated(
      admin,
      "post",
      `/api/v1/groups/${groupId}/archive`,
    ).expect(403);
    await authenticated(
      admin,
      "delete",
      `/api/v1/groups/${groupId}/members/${ownerMembershipId}`,
    ).expect(403);

    const transferred = await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/transfer-ownership`,
    )
      .send({ membershipId })
      .expect(200);
    expect(transferred.body).toMatchObject({
      currentUserRole: "ADMIN",
      members: expect.arrayContaining([
        expect.objectContaining({
          membershipId,
          role: "OWNER",
          user: expect.objectContaining({ id: admin.userId }),
        }),
      ]),
    });

    await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/archive`,
    ).expect(403);
    await authenticated(
      admin,
      "post",
      `/api/v1/groups/${groupId}/archive`,
    ).expect(200);
  });

  it("uses revocable multi-use invitation links without duplicating membership", async () => {
    const created = await createGroup(owner, "Invitation Links");
    const groupId = created.body.id as string;
    const invitation = await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/invitations`,
    ).expect(201);
    const inviteUrl = new URL(invitation.body.inviteUrl as string);
    const token = inviteUrl.pathname.split("/").at(-1)!;

    const preview = await request(application.getHttpServer())
      .get(`/api/v1/group-invitations/${token}`)
      .expect(200);
    expect(preview.body.group).toMatchObject({
      name: "Invitation Links",
      type: "TRIP",
    });

    const accepted = await authenticated(
      invitee,
      "post",
      `/api/v1/group-invitations/${token}/accept`,
    ).expect(200);
    expect(accepted.body).toMatchObject({
      id: groupId,
      currentUserRole: "MEMBER",
      members: expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ id: invitee.userId }),
          role: "MEMBER",
        }),
      ]),
    });
    await authenticated(
      invitee,
      "post",
      `/api/v1/group-invitations/${token}/accept`,
    ).expect(200);
    const secondAccepted = await authenticated(
      secondInvitee,
      "post",
      `/api/v1/group-invitations/${token}/accept`,
    ).expect(200);
    const secondMembershipId = secondAccepted.body.members.find(
      (member: { user: { id: string } }) =>
        member.user.id === secondInvitee.userId,
    ).membershipId as string;
    await authenticated(
      owner,
      "delete",
      `/api/v1/groups/${groupId}/members/${secondMembershipId}`,
    ).expect(204);
    expect(
      await prisma.groupMember.findUniqueOrThrow({
        where: { id: secondMembershipId },
      }),
    ).toMatchObject({ leftAt: expect.any(Date) });
    await authenticated(
      secondInvitee,
      "post",
      `/api/v1/group-invitations/${token}/accept`,
    ).expect(200);

    await authenticated(
      invitee,
      "post",
      `/api/v1/groups/${groupId}/leave`,
    ).expect(204);
    await authenticated(
      invitee,
      "post",
      `/api/v1/group-invitations/${token}/accept`,
    ).expect(200);

    const members = await authenticated(
      owner,
      "get",
      `/api/v1/groups/${groupId}/members`,
    ).expect(200);
    expect(
      members.body.items.filter(
        (member: { user: { id: string } }) => member.user.id === invitee.userId,
      ),
    ).toHaveLength(1);

    const invitations = await authenticated(
      owner,
      "get",
      `/api/v1/groups/${groupId}/invitations`,
    ).expect(200);
    expect(invitations.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invitationId: invitation.body.invitationId,
          status: "ACTIVE",
        }),
      ]),
    );
    await authenticated(
      owner,
      "delete",
      `/api/v1/groups/${groupId}/invitations/${invitation.body.invitationId as string}`,
    ).expect(204);
    const revoked = await request(application.getHttpServer())
      .get(`/api/v1/group-invitations/${token}`)
      .expect(200);
    expect(revoked.body.status).toBe("REVOKED");
    await authenticated(
      admin,
      "post",
      `/api/v1/group-invitations/${token}/accept`,
    ).expect(410);

    const inviteeHistory = await prisma.groupMember.findMany({
      where: { groupId, userId: invitee.userId },
      orderBy: { joinedAt: "asc" },
    });
    expect(inviteeHistory).toHaveLength(2);
    expect(inviteeHistory[0]?.leftAt).toBeInstanceOf(Date);
    expect(inviteeHistory[1]?.leftAt).toBeNull();
  });

  it("archives, restores, and only hard-deletes a safe archived group", async () => {
    const created = await createGroup(owner, "Temporary Group");
    const groupId = created.body.id as string;

    const unsafeDelete = await authenticated(
      owner,
      "delete",
      `/api/v1/groups/${groupId}`,
    ).expect(409);
    expect(unsafeDelete.body.code).toBe("GROUP_DELETE_UNSAFE");

    const archived = await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/archive`,
    ).expect(200);
    expect(archived.body).toMatchObject({
      status: "ARCHIVED",
      archivedAt: expect.any(String),
    });
    const restored = await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/restore`,
    ).expect(200);
    expect(restored.body).toMatchObject({ status: "ACTIVE", archivedAt: null });

    await authenticated(
      owner,
      "post",
      `/api/v1/groups/${groupId}/archive`,
    ).expect(200);
    await authenticated(owner, "delete", `/api/v1/groups/${groupId}`).expect(
      204,
    );
    await authenticated(owner, "get", `/api/v1/groups/${groupId}`).expect(404);
  });

  it("requires an owner to transfer ownership before deleting their account", async () => {
    const created = await createGroup(secondInvitee, "Ownership Lifecycle");
    const groupId = created.body.id as string;
    const formerOwnerMembershipId = created.body.members[0]
      .membershipId as string;
    const blocked = await authenticated(
      secondInvitee,
      "delete",
      "/api/v1/users/me",
    )
      .send({ confirmation: "DELETE" })
      .expect(409);
    expect(blocked.body.code).toBe("GROUP_OWNERSHIP_TRANSFER_REQUIRED");

    const added = await authenticated(
      secondInvitee,
      "post",
      `/api/v1/groups/${groupId}/members`,
    )
      .send({ userId: admin.userId })
      .expect(201);
    await authenticated(
      secondInvitee,
      "post",
      `/api/v1/groups/${groupId}/transfer-ownership`,
    )
      .send({ membershipId: added.body.membershipId })
      .expect(200);
    await authenticated(secondInvitee, "delete", "/api/v1/users/me")
      .send({ confirmation: "DELETE" })
      .expect(204);

    expect(
      await prisma.groupMember.findUniqueOrThrow({
        where: { id: formerOwnerMembershipId },
      }),
    ).toMatchObject({ role: "ADMIN", leftAt: expect.any(Date) });
  });

  it("publishes the groups and invitation OpenAPI paths", async () => {
    const response = await request(application.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    expect(response.body.paths).toHaveProperty("/api/v1/groups");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/groups/{groupId}/members",
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/group-invitations/{token}",
    );
  });

  async function createGroup(session: TestSession, name: string) {
    return authenticated(session, "post", "/api/v1/groups")
      .send({
        name,
        type: "TRIP",
        defaultCurrency: "THB",
        simplifyDebtsEnabled: true,
      })
      .expect(201);
  }

  async function becomeFriends(requester: TestSession, addressee: TestSession) {
    const friendship = await authenticated(
      requester,
      "post",
      "/api/v1/friends/requests",
    )
      .send({ userId: addressee.userId })
      .expect(201);
    await authenticated(
      addressee,
      "post",
      `/api/v1/friends/requests/${friendship.body.friendshipId as string}/accept`,
    ).expect(201);
  }

  async function signIn(profile: keyof typeof profiles): Promise<TestSession> {
    const start = await request(application.getHttpServer())
      .get("/api/v1/auth/google/start?returnTo=/groups")
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
