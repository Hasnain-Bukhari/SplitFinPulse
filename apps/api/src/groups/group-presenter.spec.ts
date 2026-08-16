import { describe, expect, it } from "vitest";
import { presentGroup } from "./group-presenter";

const archivedGroup = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Trip",
  type: "TRIP" as const,
  status: "ARCHIVED" as const,
  defaultCurrency: "USD",
  simplifyDebtsEnabled: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  archivedAt: new Date("2026-01-02T00:00:00Z"),
};

describe("group capabilities", () => {
  it("allows an archived sole-history owner to permanently delete", () => {
    const result = presentGroup(archivedGroup, "OWNER", 1, 1);

    expect(result.permissions).toMatchObject({
      canDelete: true,
      canRestore: true,
      canLeave: false,
    });
  });

  it("prevents deletion once the group has additional membership history", () => {
    const result = presentGroup(archivedGroup, "OWNER", 1, 2);

    expect(result.permissions.canDelete).toBe(false);
  });

  it("exposes ownership transfer only for an active owner with a recipient", () => {
    const active = {
      ...archivedGroup,
      status: "ACTIVE" as const,
      archivedAt: null,
    };

    expect(
      presentGroup(active, "OWNER", 2, 2).permissions.canTransferOwnership,
    ).toBe(true);
    expect(
      presentGroup(active, "OWNER", 1, 1).permissions.canTransferOwnership,
    ).toBe(false);
    expect(
      presentGroup(active, "ADMIN", 2, 2).permissions.canTransferOwnership,
    ).toBe(false);
  });
});
