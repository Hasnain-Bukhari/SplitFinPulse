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
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/health",
      expect.objectContaining({ credentials: "include" }),
    );
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

  it("handles empty mutation responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(api.logout()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("encodes exact-email discovery and sends CSRF-protected friend requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: "user-2", name: "Friend", avatarUrl: null },
            relationship: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            friendshipId: "friendship-1",
            status: "PENDING",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "sfp_csrf=friend-csrf; path=/";

    await api.discoverFriend("Friend+test@example.com");
    await api.createFriendRequest("user-2");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3000/api/v1/friends/discovery?email=Friend%2Btest%40example.com",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({ "X-CSRF-Token": "friend-csrf" }),
    });
  });

  it("encodes group cursors and protects group mutations with CSRF", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ membershipId: "membership-1" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "sfp_csrf=group-csrf; path=/";

    await api.groups("ARCHIVED", "cursor/+value");
    await api.addGroupMember("group/id", "user-2");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3000/api/v1/groups?status=ARCHIVED&cursor=cursor%2F%2Bvalue",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:3000/api/v1/groups/group%2Fid/members",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "X-CSRF-Token": "group-csrf" }),
      body: JSON.stringify({ userId: "user-2" }),
    });
  });
});
