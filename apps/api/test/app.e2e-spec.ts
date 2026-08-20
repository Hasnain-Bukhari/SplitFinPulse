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

const testRunId = randomUUID();
const testProfile = {
  subject: `e2e-google-subject-${testRunId}`,
  email: `epic-one-e2e-${testRunId}@example.com`,
  name: "Epic One Tester",
} as const;

describe("system endpoints", () => {
  let application: NestExpressApplication;
  let prisma: PrismaService;
  let e2eUserId: string | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleOidcService)
      .useValue({
        authorizationUrl: ({ state }: { state: string }) =>
          `https://accounts.test/authorize?state=${encodeURIComponent(state)}`,
        exchangeCode: (_code: string, _verifier: string, nonce: string) =>
          Promise.resolve({
            subject: testProfile.subject,
            email: testProfile.email,
            emailVerified: true,
            name: "Epic One Tester",
            avatarUrl: "https://example.com/avatar.png",
            nonce,
          }),
      })
      .compile();
    application = module.createNestApplication<NestExpressApplication>();
    configureApplication(application);
    await application.init();
    prisma = application.get(PrismaService);
  });

  afterAll(async () => {
    const user = e2eUserId
      ? await prisma.user.findUnique({ where: { id: e2eUserId } })
      : undefined;
    if (user) {
      await deleteTraceRecords(prisma, [user.id]);
      await prisma.accountLifecycleEvent.deleteMany({
        where: { userId: user.id },
      });
      await prisma.deletedAuthIdentity.deleteMany({
        where: { userId: user.id },
      });
      await prisma.authSession.deleteMany({ where: { userId: user.id } });
      await prisma.authIdentity.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await application.close();
  });

  it("reports liveness and returns a request ID", async () => {
    const response = await request(application.getHttpServer())
      .get("/health")
      .expect(200);

    expect(response.body).toMatchObject({ status: "ok" });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("reports database readiness", async () => {
    const response = await request(application.getHttpServer())
      .get("/ready")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      checks: { database: "up" },
    });
  });

  it("publishes the OpenAPI document outside the version prefix", async () => {
    const response = await request(application.getHttpServer())
      .get("/api/docs-json")
      .expect(200);

    expect(response.body.info.title).toBe("SplitFinPulse API");
    expect(response.body.paths).toHaveProperty("/health");
  });

  it("uses the normalized error contract for unknown product routes", async () => {
    const response = await request(application.getHttpServer())
      .get("/api/v1/missing")
      .set("x-request-id", "e2e-request")
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      code: "HTTP_404",
      path: "/api/v1/missing",
      requestId: "e2e-request",
    });
  });

  it("protects account endpoints with a stable authentication error", async () => {
    const response = await request(application.getHttpServer())
      .get("/api/v1/users/me")
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: "AUTH_REQUIRED",
      path: "/api/v1/users/me",
    });
  });

  it("publishes the authentication and account contract", async () => {
    const response = await request(application.getHttpServer())
      .get("/api/docs-json")
      .expect(200);

    expect(response.body.paths).toHaveProperty("/api/v1/auth/session");
    expect(response.body.paths).toHaveProperty("/api/v1/users/me");
  });

  it("creates a Google account, persists a cookie session, updates the profile, and logs out", async () => {
    const start = await request(application.getHttpServer())
      .get("/api/v1/auth/google/start?returnTo=/settings/profile")
      .expect(302);
    const state = new URL(start.headers.location as string).searchParams.get(
      "state",
    );
    expect(state).toBeTruthy();

    const callback = await request(application.getHttpServer())
      .get(
        `/api/v1/auth/google/callback?code=test-code&state=${encodeURIComponent(state!)}`,
      )
      .set("user-agent", "E2E Browser")
      .expect(302);
    const cookieHeaders = callback.headers["set-cookie"] as unknown as string[];
    const cookies = cookieHeaders
      .map((value) => value.split(";")[0])
      .join("; ");
    const csrf = cookieHeaders
      .find((value) => value.startsWith("sfp_csrf="))
      ?.split(";")[0]
      ?.split("=")[1];
    expect(csrf).toBeTruthy();

    const session = await request(application.getHttpServer())
      .get("/api/v1/auth/session")
      .set("cookie", cookies)
      .expect(200);
    expect(session.body.user).toMatchObject({
      email: testProfile.email,
      name: "Epic One Tester",
    });
    e2eUserId = session.body.user.id as string;

    const profile = await request(application.getHttpServer())
      .patch("/api/v1/users/me")
      .set("cookie", cookies)
      .set("origin", "http://localhost:5173")
      .set("x-csrf-token", csrf!)
      .send({ name: "Updated Tester", defaultCurrency: "THB" })
      .expect(200);
    expect(profile.body).toMatchObject({
      name: "Updated Tester",
      defaultCurrency: "THB",
    });

    await request(application.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("cookie", cookies)
      .set("origin", "http://localhost:5173")
      .set("x-csrf-token", csrf!)
      .expect(204);
    await request(application.getHttpServer())
      .get("/api/v1/auth/session")
      .set("cookie", cookies)
      .expect(401);
  });

  it("prevents a deleted Google identity from creating a new account", async () => {
    const start = await request(application.getHttpServer())
      .get("/api/v1/auth/google/start")
      .expect(302);
    const state = new URL(start.headers.location as string).searchParams.get(
      "state",
    );
    const callback = await request(application.getHttpServer())
      .get(
        `/api/v1/auth/google/callback?code=test-code&state=${encodeURIComponent(state!)}`,
      )
      .expect(302);
    const cookieHeaders = callback.headers["set-cookie"] as unknown as string[];
    const cookies = cookieHeaders
      .map((value) => value.split(";")[0])
      .join("; ");
    const csrf = cookieHeaders
      .find((value) => value.startsWith("sfp_csrf="))
      ?.split(";")[0]
      ?.split("=")[1];

    await request(application.getHttpServer())
      .delete("/api/v1/users/me")
      .set("cookie", cookies)
      .set("origin", "http://localhost:5173")
      .set("x-csrf-token", csrf!)
      .send({ confirmation: "DELETE" })
      .expect(204);

    const retry = await request(application.getHttpServer())
      .get("/api/v1/auth/google/start")
      .expect(302);
    const retryState = new URL(
      retry.headers.location as string,
    ).searchParams.get("state");
    const rejected = await request(application.getHttpServer())
      .get(
        `/api/v1/auth/google/callback?code=test-code&state=${encodeURIComponent(retryState!)}`,
      )
      .expect(302);
    expect(rejected.headers.location).toContain("reason=account_deleted");
    expect(
      await prisma.user.count({
        where: {
          OR: [{ id: e2eUserId }, { email: testProfile.email }],
        },
      }),
    ).toBe(1);
  });
});
