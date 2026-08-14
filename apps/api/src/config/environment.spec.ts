import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/splitfinpulse",
  CORS_ORIGINS: "http://localhost:5173,https://app.example.com",
};

describe("validateEnvironment", () => {
  it("applies safe defaults and parses the port", () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      NODE_ENV: "development",
      PORT: 3000,
      LOG_LEVEL: "info",
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
