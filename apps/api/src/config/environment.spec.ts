import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/splitfinpulse",
  CORS_ORIGINS: "http://localhost:5173,https://app.example.com",
  WEB_APP_URL: "http://localhost:5173",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/v1/auth/google/callback",
  AUTH_ISSUER: "splitfinpulse",
  AUTH_AUDIENCE: "splitfinpulse-web",
  AUTH_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
  AUTH_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
  OIDC_TRANSACTION_SECRET: "oidc-secret-that-is-at-least-32-characters",
  FRIEND_INVITE_SECRET: "invite-secret-that-is-at-least-32-characters",
};

describe("validateEnvironment", () => {
  it("applies safe defaults and parses the port", () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      NODE_ENV: "development",
      PORT: 3000,
      LOG_LEVEL: "info",
      AUTH_ACCESS_TTL_SECONDS: 600,
      AUTH_REFRESH_TTL_SECONDS: 2_592_000,
      AUTH_IDLE_TTL_SECONDS: 604_800,
      FRIEND_INVITE_TTL_SECONDS: 604_800,
      ATTACHMENT_STORAGE_ROOT: "/tmp/splitfinpulse-attachments",
      ATTACHMENT_UPLOAD_SECRET: "invite-secret-that-is-at-least-32-characters",
      ATTACHMENT_MAX_BYTES: 10_485_760,
    });
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost/db",
      }),
    ).toThrow("DATABASE_URL must use one of");
  });

  it("rejects invalid ports and CORS origins", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: "70000" }),
    ).toThrow("PORT");
    expect(() =>
      validateEnvironment({ ...validEnvironment, CORS_ORIGINS: "*" }),
    ).toThrow("CORS_ORIGINS");
  });
});
