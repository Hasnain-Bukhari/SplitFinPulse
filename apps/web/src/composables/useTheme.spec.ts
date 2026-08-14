import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "./useTheme";

const ThemeHarness = defineComponent({
  setup() {
    return useTheme();
  },
  template: '<button @click="cycleTheme">{{ theme }}</button>',
});

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("loads and persists the selected theme", async () => {
    localStorage.setItem("splitfinpulse-theme", "light");
    const wrapper = mount(ThemeHarness);
    await nextTick();

    expect(wrapper.text()).toBe("light");
    await wrapper.get("button").trigger("click");
    await nextTick();

    expect(wrapper.text()).toBe("dark");
    expect(localStorage.getItem("splitfinpulse-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
