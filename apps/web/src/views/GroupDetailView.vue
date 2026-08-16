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

const route = useRoute();
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
          <Card class="deferred-panel p-5"
            ><WalletCards aria-hidden="true" />
            <h2>Balances</h2>
            <p>
              Balances will appear after expenses and the auditable ledger are
              available.
            </p></Card
          >
          <Card class="deferred-panel p-5"
            ><ReceiptText aria-hidden="true" />
            <h2>Recent expenses</h2>
            <p>
              No expense records exist yet. This group is ready for the next
              financial slice.
            </p></Card
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
