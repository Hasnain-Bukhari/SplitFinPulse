import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { RouterLinkStub, flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
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
  beforeEach(() => {
    vi.spyOn(api, "profileOptions").mockResolvedValue({
      currencies: [{ code: "USD", name: "US dollar", minorUnit: 2 }],
      timezones: [],
      locales: [],
    });
    vi.spyOn(api, "friendBalances").mockResolvedValue({
      friendshipId: "friendship-1",
      friend: item.user,
      amounts: [
        {
          currency: "USD",
          youOweMinor: "0",
          youAreOwedMinor: "1250",
          netMinor: "1250",
        },
      ],
    });
  });

  function mountRow(kind: "accepted" | "incoming") {
    return mount(FriendPersonRow, {
      props: {
        item: { ...item, status: kind === "accepted" ? "ACCEPTED" : "PENDING" },
        kind,
      },
      global: {
        plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
        stubs: { RouterLink: RouterLinkStub },
      },
    });
  }

  it("exposes labeled incoming-request actions", async () => {
    const wrapper = mountRow("incoming");
    await wrapper
      .get('button[aria-label="Accept Sam Friend"]')
      .trigger("click");
    await wrapper
      .get('button[aria-label="Decline Sam Friend"]')
      .trigger("click");
    expect(wrapper.emitted("accept")?.[0]).toEqual(["friendship-1"]);
    expect(wrapper.emitted("decline")?.[0]).toEqual(["friendship-1"]);
  });

  it("shows the authoritative per-currency friend balance", async () => {
    const wrapper = mountRow("accepted");
    await flushPromises();
    expect(wrapper.text()).toContain("USD 12.50 net");
  });
});
