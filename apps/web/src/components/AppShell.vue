<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import {
  Activity,
  ChevronLeft,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  WalletCards,
} from "@lucide/vue";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/lib/api/client";
import { queryClient, sessionQueryOptions } from "@/lib/query-client";
import { useUiStore } from "@/stores/ui";
import BrandMark from "./BrandMark.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { Button } from "./ui/button";

const navigation = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Friends", to: "/friends", icon: UserRoundPlus },
  { label: "Balances", to: "/balances", icon: WalletCards },
  { label: "Groups", to: "/groups", icon: UsersRound },
  { label: "Activity", to: "/activity", icon: Activity },
  { label: "Settings", to: "/settings/profile", icon: Settings },
];

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const session = useQuery(sessionQueryOptions);
const pageTitle = computed(
  () =>
    (typeof route.meta.title === "string" ? route.meta.title : undefined) ??
    navigation.find((item) => item.to === route.path)?.label ??
    "SplitFinPulse",
);
const logout = useMutation({
  mutationFn: api.logout,
  onSettled: async () => {
    queryClient.clear();
    await router.replace("/login");
  },
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
          ><ChevronLeft :size="17" aria-hidden="true"
        /></Button>
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
          <component :is="item.icon" :size="19" aria-hidden="true" /><span
            v-if="!ui.sidebarCollapsed"
            >{{ item.label }}</span
          >
        </RouterLink>
      </nav>
      <div class="border-border border-t p-3">
        <div v-if="!ui.sidebarCollapsed" class="system-status">
          <ShieldCheck :size="15" aria-hidden="true" /><span
            >Protected session</span
          >
        </div>
        <Button
          v-else
          variant="ghost"
          size="icon"
          aria-label="Expand navigation"
          class="w-full"
          @click="ui.toggleSidebar"
          ><Menu :size="18" aria-hidden="true"
        /></Button>
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
          <details class="profile-menu">
            <summary aria-label="Open profile menu">
              <img
                v-if="session.data.value?.user.avatarUrl"
                :src="session.data.value.user.avatarUrl"
                alt=""
              /><CircleUserRound v-else :size="20" aria-hidden="true" />
            </summary>
            <div class="profile-menu__panel">
              <strong>{{ session.data.value?.user.name }}</strong
              ><small>{{ session.data.value?.user.email }}</small>
              <RouterLink to="/settings/profile">Profile settings</RouterLink>
              <RouterLink to="/settings/security">Security</RouterLink>
              <button type="button" @click="logout.mutate()">
                <LogOut :size="16" aria-hidden="true" /> Sign out
              </button>
            </div>
          </details>
        </div>
      </header>
      <main id="main-content" class="content-area"><RouterView /></main>
    </div>

    <nav aria-label="Mobile navigation" class="mobile-nav">
      <RouterLink
        v-for="item in navigation"
        :key="item.to"
        :to="item.to"
        class="mobile-nav-link"
        ><component :is="item.icon" :size="20" aria-hidden="true" /><span>{{
          item.label
        }}</span></RouterLink
      >
    </nav>
  </div>
</template>
