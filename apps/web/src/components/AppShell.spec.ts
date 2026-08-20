import { VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "@/router";
import AppShell from "./AppShell.vue";

describe("AppShell", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders accessible primary and mobile navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
          {
            status: 200,
          },
        ),
      ),
    );
    await router.push("/");
    await router.isReady();

    const wrapper = mount(AppShell, {
      global: { plugins: [createPinia(), router, VueQueryPlugin] },
    });

    expect(
      wrapper.get('nav[aria-label="Primary navigation"]').text(),
    ).toContain("Overview");
    const mobileNav = wrapper.get('nav[aria-label="Mobile navigation"]');
    expect(mobileNav.text()).toContain("Expenses");
    expect(mobileNav.text()).toContain("Add");
    expect(mobileNav.text()).toContain("More");
    expect(mobileNav.findAll("a")).toHaveLength(5);
    expect(mobileNav.text()).not.toContain("Activity");
    expect(mobileNav.text()).not.toContain("Settings");
    expect(wrapper.get("main").attributes("id")).toBe("main-content");
  });
});
