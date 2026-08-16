import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FriendPersonRow from "./FriendPersonRow.vue";

const item = {
  friendshipId: "friendship-1",
  user: { id: "user-2", name: "Sam Friend", avatarUrl: null },
  status: "PENDING" as const,
  direction: "incoming" as const,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  acceptedAt: null,
};

describe("FriendPersonRow", () => {
  it("exposes labeled incoming-request actions", async () => {
    const wrapper = mount(FriendPersonRow, {
      props: { item, kind: "incoming" },
    });
    await wrapper
      .get('button[aria-label="Accept Sam Friend"]')
      .trigger("click");
    await wrapper
      .get('button[aria-label="Decline Sam Friend"]')
      .trigger("click");
    expect(wrapper.emitted("accept")?.[0]).toEqual(["friendship-1"]);
    expect(wrapper.emitted("decline")?.[0]).toEqual(["friendship-1"]);
  });

  it("uses a neutral balance placeholder for accepted friends", () => {
    const wrapper = mount(FriendPersonRow, {
      props: { item: { ...item, status: "ACCEPTED" }, kind: "accepted" },
    });
    expect(wrapper.text()).toContain("Balance available with shared expenses");
    expect(wrapper.text()).not.toContain("0.00");
  });
});
