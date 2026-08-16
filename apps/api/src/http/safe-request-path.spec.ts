import { describe, expect, it } from "vitest";
import { safeRequestPath } from "./safe-request-path";

describe("safeRequestPath", () => {
  it("redacts friend invitation tokens and retains route suffixes", () => {
    expect(
      safeRequestPath(
        "/api/v1/friend-invitations/sensitive.signed.token/accept?source=web",
      ),
    ).toBe("/api/v1/friend-invitations/:token/accept");
  });
});
