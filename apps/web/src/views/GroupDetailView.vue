<script setup lang="ts">
import { useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import {
  Activity,
  ReceiptText,
  Settings,
  UsersRound,
  WalletCards,
} from "@lucide/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import GroupIdentity from "@/features/groups/GroupIdentity.vue";
import {
  groupRoleLabels,
  groupTypeLabels,
} from "@/features/groups/group-display";
import { api, ApiError } from "@/lib/api/client";
import BalanceAmounts from "@/features/balances/BalanceAmounts.vue";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";

const route = useRoute();
const { formatCurrency } = useCurrencyFormatter();
const groupId = computed(() => String(route.params.groupId));
const group = useQuery(
  computed(() => ({
    queryKey: ["groups", "detail", groupId.value],
    queryFn: () => api.group(groupId.value),
  })),
);
const members = useInfiniteQuery(
  computed(() => ({
    queryKey: ["groups", groupId.value, "members"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.groupMembers(groupId.value, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) =>
      last.nextCursor ?? undefined,
  })),
);
const memberItems = computed(
  () => members.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const balances = useQuery(
  computed(() => ({
    queryKey: ["balances", "groups", groupId.value],
    queryFn: () => api.groupBalances(groupId.value),
    enabled: Boolean(group.data.value),
  })),
);
const expenses = useQuery(
  computed(() => ({
    queryKey: ["expenses", "groups", groupId.value, "recent"],
    queryFn: () => api.expenses({ groupId: groupId.value, status: "ACTIVE" }),
    enabled: Boolean(group.data.value),
  })),
);
function errorMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You are offline. Reconnect to view this group.";
  return error instanceof ApiError
    ? error.message
    : "This group could not be loaded.";
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-4">
    <p
      v-if="group.isPending.value"
      class="text-muted-foreground py-10 text-sm"
      role="status"
    >
      Loading group…
    </p>
    <Card v-else-if="group.isError.value" class="p-5">
      <p class="form-error" role="alert">
        {{ errorMessage(group.error.value) }}
      </p>
      <Button class="mt-3" variant="outline" size="sm" @click="group.refetch()"
        >Try again</Button
      >
    </Card>
    <template v-else-if="group.data.value">
      <Card class="group-detail-header p-5 sm:p-6">
        <GroupIdentity :name="group.data.value.name" size="lg" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="truncate text-2xl font-bold">
              {{ group.data.value.name }}
            </h2>
            <span
              v-if="group.data.value.status === 'ARCHIVED'"
              class="status-badge"
              >Archived</span
            >
          </div>
          <p class="text-muted-foreground mt-1 text-sm">
            {{ groupTypeLabels[group.data.value.type] }} ·
            {{ group.data.value.defaultCurrency }} ·
            {{ groupRoleLabels[group.data.value.currentUserRole] }}
          </p>
        </div>
        <Button
          v-if="
            group.data.value.permissions.canEdit ||
            group.data.value.permissions.canManageMembers ||
            group.data.value.permissions.canLeave
          "
          as-child
          variant="outline"
        >
          <RouterLink :to="`/groups/${groupId}/settings`"
            ><Settings :size="16" aria-hidden="true" /> Manage</RouterLink
          >
        </Button>
        <Button v-if="group.data.value.status === 'ACTIVE'" as-child>
          <RouterLink :to="`/expenses/new?groupId=${groupId}`"
            >Add expense</RouterLink
          >
        </Button>
      </Card>

      <div class="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card class="p-5">
          <div class="section-heading">
            <div>
              <p class="section-kicker">People</p>
              <h2>Members</h2>
            </div>
            <UsersRound :size="19" aria-hidden="true" />
          </div>
          <ul class="divide-border divide-y" aria-label="Group members">
            <li
              v-for="member in memberItems"
              :key="member.membershipId"
              class="flex items-center gap-3 py-3"
            >
              <img
                v-if="member.user.avatarUrl"
                :src="member.user.avatarUrl"
                alt=""
                class="group-member-avatar"
              />
              <span v-else class="group-member-avatar" aria-hidden="true"
                ><UsersRound :size="17"
              /></span>
              <div class="min-w-0">
                <strong class="block truncate text-sm">{{
                  member.user.name
                }}</strong
                ><span class="text-muted-foreground text-xs">{{
                  groupRoleLabels[member.role]
                }}</span>
              </div>
            </li>
          </ul>
          <Button
            v-if="members.hasNextPage.value"
            variant="ghost"
            size="sm"
            :disabled="members.isFetchingNextPage.value"
            @click="members.fetchNextPage()"
          >
            Load more members
          </Button>
        </Card>

        <div class="grid gap-4 sm:grid-cols-2">
          <Card class="p-5"
            ><WalletCards aria-hidden="true" />
            <h2 class="mt-2 font-bold">Balances</h2>
            <BalanceAmounts
              v-if="balances.data.value"
              class="mt-3"
              :amounts="balances.data.value.currentUser"
            />
            <p v-else class="text-muted-foreground mt-2 text-sm">
              {{
                balances.isPending.value
                  ? "Loading balances…"
                  : "Balances unavailable."
              }}
            </p>
            <RouterLink
              class="text-primary mt-3 inline-block text-sm font-semibold"
              :to="`/groups/${groupId}/balances`"
              >View group balances →</RouterLink
            ></Card
          >
          <Card class="p-5"
            ><ReceiptText aria-hidden="true" />
            <h2 class="mt-2 font-bold">Recent expenses</h2>
            <p
              v-if="!expenses.data.value?.items.length"
              class="text-muted-foreground mt-2 text-sm"
            >
              No expenses yet.
            </p>
            <ul v-else class="mt-2 divide-y">
              <li
                v-for="item in expenses.data.value.items.slice(0, 4)"
                :key="item.id"
                class="py-2"
              >
                <RouterLink
                  :to="`/expenses/${item.id}`"
                  class="flex justify-between gap-2 text-sm"
                  ><span class="truncate">{{ item.description }}</span
                  ><strong class="tabular-nums">{{
                    formatCurrency(item.totalMinor, item.currency)
                  }}</strong></RouterLink
                >
              </li>
            </ul></Card
          >
          <Card class="deferred-panel p-5 sm:col-span-2"
            ><Activity aria-hidden="true" />
            <h2>Activity</h2>
            <p>
              Group activity will appear here once the shared activity timeline
              is implemented.
            </p></Card
          >
        </div>
      </div>
    </template>
  </div>
</template>
