import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import type { Environment } from "../config/environment";
import { TokenService } from "./token.service";

const values: Partial<Environment> = {
  AUTH_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
  AUTH_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
  AUTH_ACCESS_TTL_SECONDS: 600,
  AUTH_REFRESH_TTL_SECONDS: 2_592_000,
  AUTH_ISSUER: "splitfinpulse-test",
  AUTH_AUDIENCE: "splitfinpulse-web-test",
};

const config = {
  get: (key: keyof Environment) => values[key],
} as unknown as ConfigService<Environment, true>;

describe("TokenService", () => {
  const service = new TokenService(new JwtService(), config);

  it("separates access and refresh credentials", async () => {
    const access = await service.access("user-1", "session-1", 3);
    const refresh = await service.refresh("user-1", "session-1", 3);

    await expect(service.verifyAccess(access)).resolves.toMatchObject({
      sub: "user-1",
      sid: "session-1",
      typ: "access",
      ver: 3,
    });
    await expect(service.verifyRefresh(refresh)).resolves.toMatchObject({
      typ: "refresh",
    });
    await expect(service.verifyAccess(refresh)).rejects.toThrow();
  });

  it("hashes refresh credentials without storing the raw token", async () => {
    const refresh = await service.refresh("user-1", "session-1", 1);
    const hash = service.hash(refresh);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(refresh);
    expect(service.hashesMatch(refresh, hash)).toBe(true);
    expect(service.hashesMatch(`${refresh}changed`, hash)).toBe(false);
  });
});
