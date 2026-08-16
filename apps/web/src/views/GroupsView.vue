<script setup lang="ts">
import { useInfiniteQuery } from "@tanstack/vue-query";
import { Archive, ChevronRight, Plus, UsersRound } from "@lucide/vue";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import GroupIdentity from "@/features/groups/GroupIdentity.vue";
import {
  groupRoleLabels,
  groupTypeLabels,
} from "@/features/groups/group-display";
import { api, ApiError, type GroupStatus } from "@/lib/api/client";

const status = ref<GroupStatus>("ACTIVE");

const groups = useInfiniteQuery(
  computed(() => ({
    queryKey: ["groups", status.value],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.groups(status.value, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) =>
      last.nextCursor ?? undefined,
  })),
);

const items = computed(
  () => groups.data.value?.pages.flatMap((page) => page.items) ?? [],
);

function errorMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You are offline. Reconnect to load your groups.";
  }
  return error instanceof ApiError
    ? error.message
    : "Groups could not be loaded. Try again.";
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="section-kicker">Shared spaces</p>
        <h2 class="mt-1 text-xl font-bold">Your groups</h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Organize people now, then keep future expenses and balances together.
        </p>
      </div>
      <Button as-child>
        <RouterLink to="/groups/new">
          <Plus :size="17" aria-hidden="true" /> Create group
        </RouterLink>
      </Button>
    </div>

    <div class="group-filter" role="group" aria-label="Group status">
      <button
        type="button"
        :aria-pressed="status === 'ACTIVE'"
        @click="status = 'ACTIVE'"
      >
        Active
      </button>
      <button
        type="button"
        :aria-pressed="status === 'ARCHIVED'"
        @click="status = 'ARCHIVED'"
      >
        Archived
      </button>
    </div>

    <p
      v-if="groups.isPending.value"
      class="text-muted-foreground py-10 text-sm"
      role="status"
    >
      Loading groups…
    </p>
    <Card v-else-if="groups.isError.value" class="p-5">
      <p class="form-error" role="alert">
        {{ errorMessage(groups.error.value) }}
      </p>
      <Button
        class="mt-3"
        variant="outline"
        size="sm"
        @click="groups.refetch()"
      >
        Try again
      </Button>
    </Card>
    <Card v-else-if="items.length === 0" class="empty-page">
      <span class="empty-state-icon"
        ><Archive
          v-if="status === 'ARCHIVED'"
          :size="24"
          aria-hidden="true" /><UsersRound v-else :size="24" aria-hidden="true"
      /></span>
      <h2>
        {{
          status === "ARCHIVED"
            ? "No archived groups"
            : "Create your first group"
        }}
      </h2>
      <p>
        {{
          status === "ARCHIVED"
            ? "Groups you archive will remain available here with their history intact."
            : "Start with a trip, home, couple, or any group of people sharing costs."
        }}
      </p>
      <Button v-if="status === 'ACTIVE'" as-child class="mt-4">
        <RouterLink to="/groups/new">Create group</RouterLink>
      </Button>
    </Card>
    <ul
      v-else
      class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Groups"
    >
      <li v-for="group in items" :key="group.id">
        <RouterLink :to="`/groups/${group.id}`" class="group-card-link">
          <GroupIdentity :name="group.name" />
          <div class="min-w-0 flex-1">
            <strong class="block truncate">{{ group.name }}</strong>
            <p class="text-muted-foreground mt-1 text-xs">
              {{ groupTypeLabels[group.type] }} · {{ group.memberCount }}
              {{ group.memberCount === 1 ? "member" : "members" }} ·
              {{ groupRoleLabels[group.currentUserRole] }}
            </p>
            <span class="group-currency">{{ group.defaultCurrency }}</span>
          </div>
          <ChevronRight :size="18" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>

    <Button
      v-if="groups.hasNextPage.value"
      variant="outline"
      :disabled="groups.isFetchingNextPage.value"
      @click="groups.fetchNextPage()"
    >
      {{ groups.isFetchingNextPage.value ? "Loading…" : "Load more" }}
    </Button>
  </div>
</template>
