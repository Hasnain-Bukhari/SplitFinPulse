import { defineStore } from "pinia";
import { ref } from "vue";

const storageKey = "splitfinpulse-sidebar-collapsed";

export const useUiStore = defineStore("ui", () => {
  const sidebarCollapsed = ref(localStorage.getItem(storageKey) === "true");

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    localStorage.setItem(storageKey, String(sidebarCollapsed.value));
  }

  return { sidebarCollapsed, toggleSidebar };
});
