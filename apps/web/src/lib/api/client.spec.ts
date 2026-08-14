import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

describe("API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns typed JSON for successful requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
            timestamp: "2026-01-01T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(api.health()).resolves.toMatchObject({ status: "ok" });
  });

  it("normalizes API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 503,
            code: "DEPENDENCY_UNAVAILABLE",
            message: "Try again shortly",
            requestId: "request-1",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const error = await api.health().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
    });
  });
});
