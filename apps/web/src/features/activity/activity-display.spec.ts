import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/lib/api/client";
import { activityTarget, activityText } from "./activity-display";

const base: ActivityEvent = {
  id: "event-1",
  type: "EXPENSE_CREATED",
  actor: { id: "user-1", name: "Jordan", avatarUrl: null },
  entityType: "EXPENSE",
  entityId: "expense-1",
  occurredAt: "2026-08-17T12:00:00.000Z",
  groupId: "group-1",
  friendshipId: null,
  payloadVersion: 1,
  payload: { description: "Dinner" },
};

describe("activity display", () => {
  it("formats normalized events without HTML", () => {
    expect(activityText(base)).toBe("Jordan added Dinner");
    expect(
      activityText({
        ...base,
        type: "SETTLEMENT_CREATED",
        entityType: "SETTLEMENT",
        entityId: "settlement-1",
        payload: { fromName: "Jordan", toName: "Alex" },
      }),
    ).toBe("Jordan paid Alex");
  });

  it("formats every supported discriminant and safely falls back", () => {
    const types = [
      "EXPENSE_CREATED",
      "EXPENSE_UPDATED",
      "EXPENSE_DELETED",
      "EXPENSE_RESTORED",
      "GROUP_CREATED",
      "GROUP_UPDATED",
      "GROUP_ARCHIVED",
      "GROUP_RESTORED",
      "GROUP_MEMBER_ADDED",
      "GROUP_MEMBER_ROLE_UPDATED",
      "GROUP_MEMBER_REMOVED",
      "GROUP_MEMBER_LEFT",
      "GROUP_OWNERSHIP_TRANSFERRED",
      "SETTLEMENT_CREATED",
      "SETTLEMENT_REVERSED",
      "SETTLEMENT_REPLACED",
      "COMMENT_CREATED",
      "COMMENT_UPDATED",
      "COMMENT_DELETED",
    ] as const;
    for (const type of types) {
      expect(activityText({ ...base, type })).not.toContain("undefined");
    }
    expect(activityText({ ...base, type: "FUTURE_EVENT" })).toBe(
      "Jordan updated activity",
    );
    expect(
      activityText({
        ...base,
        payload: { description: "<img src=x onerror=alert(1)>" },
      }),
    ).toContain("<img src=x onerror=alert(1)>");
  });

  it("prefers the most specific deep link", () => {
    expect(activityTarget(base)).toBe("/expenses/expense-1");
    expect(
      activityTarget({
        ...base,
        entityType: "SETTLEMENT",
        entityId: "settlement-1",
      }),
    ).toBe("/settlements/settlement-1");
  });
});
