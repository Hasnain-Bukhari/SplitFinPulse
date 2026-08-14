import { ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  const prisma = { isReady: vi.fn() };
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService(prisma as unknown as PrismaService);
  });

  it("reports liveness without querying the database", () => {
    expect(service.liveness()).toMatchObject({ status: "ok" });
    expect(prisma.isReady).not.toHaveBeenCalled();
  });

  it("reports readiness when PostgreSQL responds", async () => {
    prisma.isReady.mockResolvedValue(true);

    await expect(service.readiness()).resolves.toMatchObject({
      status: "ok",
      checks: { database: "up" },
    });
  });

  it("returns a service-unavailable error when PostgreSQL fails", async () => {
    prisma.isReady.mockRejectedValue(new Error("connection refused"));

    await expect(service.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
