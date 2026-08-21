<script setup lang="ts">
import {
  Activity,
  Bell,
  CalendarClock,
  ChartNoAxesCombined,
  Gauge,
  Settings,
  UserRoundPlus,
  UsersRound,
} from "@lucide/vue";
import { Card } from "@/components/ui/card";

const destinations = [
  {
    label: "Friends",
    description: "Friend requests and direct expenses",
    to: "/friends",
    icon: UserRoundPlus,
  },
  {
    label: "Groups",
    description: "Shared spaces and members",
    to: "/groups",
    icon: UsersRound,
  },
  {
    label: "Activity",
    description: "Authorized financial history",
    to: "/activity",
    icon: Activity,
  },
  {
    label: "Notifications",
    description: "Updates and unread items",
    to: "/notifications",
    icon: Bell,
  },
  {
    label: "Recurring expenses",
    description: "Automatic future expenses",
    to: "/recurring-expenses",
    icon: CalendarClock,
  },
  {
    label: "Reminders",
    description: "Payment reminder history",
    to: "/reminders",
    icon: Activity,
  },
  {
    label: "Analytics",
    description: "Spending trends and categories",
    to: "/analytics",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Budgets",
    description: "Monthly spending limits",
    to: "/budgets",
    icon: Gauge,
  },
  {
    label: "Settings",
    description: "Profile, categories, security, and data",
    to: "/settings/profile",
    icon: Settings,
  },
];
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4">
    <div>
      <p class="section-kicker">Navigation</p>
      <h1 class="text-2xl font-bold">More</h1>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <RouterLink v-for="item in destinations" :key="item.to" :to="item.to">
        <Card class="flex h-full items-start gap-3 p-4">
          <component :is="item.icon" :size="20" aria-hidden="true" />
          <span
            ><strong class="block">{{ item.label }}</strong
            ><span class="text-muted-foreground text-sm">{{
              item.description
            }}</span></span
          >
        </Card>
      </RouterLink>
    </div>
  </div>
</template>
