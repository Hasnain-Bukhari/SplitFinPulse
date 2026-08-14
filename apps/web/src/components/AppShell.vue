<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  Activity,
  ChevronLeft,
  CircleUserRound,
  LayoutDashboard,
  Menu,
  Settings,
  UsersRound,
} from "@lucide/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { api } from "@/lib/api/client";
import { useUiStore } from "@/stores/ui";
import BrandMark from "./BrandMark.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { Button } from "./ui/button";

const navigation = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Groups", to: "/groups", icon: UsersRound },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Settings", to: "/settings", icon: Settings },
];

const route = useRoute();
const ui = useUiStore();
const pageTitle = computed(
  () =>
    navigation.find((item) => item.to === route.path)?.label ?? "SplitFinPulse",
);
const health = useQuery({
  queryKey: ["system", "health"],
  queryFn: api.health,
  retry: 1,
  refetchInterval: 60_000,
});
</script>

<template>
  <div class="app-frame">
    <aside
      class="sidebar"
      :class="{ 'sidebar--collapsed': ui.sidebarCollapsed }"
    >
      <div class="flex h-18 items-center justify-between px-5">
        <BrandMark :compact="ui.sidebarCollapsed" />
        <Button
          v-if="!ui.sidebarCollapsed"
          variant="ghost"
          size="icon"
          aria-label="Collapse navigation"
          class="hidden size-8 lg:inline-flex"
          @click="ui.toggleSidebar"
        >
          <ChevronLeft :size="17" aria-hidden="true" />
        </Button>
      </div>

      <nav
        aria-label="Primary navigation"
        class="flex flex-1 flex-col gap-1 px-3 py-5"
      >
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :aria-label="ui.sidebarCollapsed ? item.label : undefined"
        >
          <component :is="item.icon" :size="19" aria-hidden="true" />
          <span v-if="!ui.sidebarCollapsed">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="border-border border-t p-3">
        <div v-if="!ui.sidebarCollapsed" class="system-status">
          <span
            class="status-dot"
            :class="
              health.isSuccess.value
                ? 'status-dot--online'
                : 'status-dot--pending'
            "
            aria-hidden="true"
          />
          <span>{{
            health.isSuccess.value
              ? "Services connected"
              : "Connecting services"
          }}</span>
        </div>
        <Button
          v-else
          variant="ghost"
          size="icon"
          aria-label="Expand navigation"
          class="w-full"
          @click="ui.toggleSidebar"
        >
          <Menu :size="18" aria-hidden="true" />
        </Button>
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <header class="topbar">
        <div>
          <p
            class="text-muted-foreground hidden text-xs font-semibold tracking-[0.12em] uppercase sm:block"
          >
            Personal workspace
          </p>
          <h1
            class="text-foreground text-lg font-bold tracking-[-0.025em] sm:text-xl"
          >
            {{ pageTitle }}
          </h1>
        </div>
        <div class="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Open profile">
            <CircleUserRound :size="20" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main id="main-content" class="content-area">
        <RouterView />
      </main>
    </div>

    <nav aria-label="Mobile navigation" class="mobile-nav">
      <RouterLink
        v-for="item in navigation"
        :key="item.to"
        :to="item.to"
        class="mobile-nav-link"
      >
        <component :is="item.icon" :size="20" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
