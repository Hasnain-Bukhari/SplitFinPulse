import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/application";

describe("system endpoints", () => {
  let application: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = module.createNestApplication<NestExpressApplication>();
    configureApplication(application);
    await application.init();
  });

  afterAll(async () => {
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
});
