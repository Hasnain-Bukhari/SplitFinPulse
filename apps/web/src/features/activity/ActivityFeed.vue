<script setup lang="ts">
import { useInfiniteQuery } from "@tanstack/vue-query";
import { Activity } from "@lucide/vue";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api, type ActivityPage } from "@/lib/api/client";
import { activityTarget, activityText } from "./activity-display";

const props = withDefaults(
  defineProps<{
    groupId?: string | undefined;
    limit?: number | undefined;
  }>(),
  { groupId: undefined, limit: undefined },
);
const { formatCurrency } = useCurrencyFormatter();
const result = useInfiniteQuery(
  computed(() => ({
    queryKey: props.groupId
      ? ["activities", "group", props.groupId]
      : ["activities", "personal"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      props.groupId
        ? api.groupActivities(props.groupId, pageParam)
        : api.activities(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ActivityPage) => page.nextCursor ?? undefined,
  })),
);
const items = computed(() => {
  const all = result.data.value?.pages.flatMap((page) => page.items) ?? [];
  return props.limit === undefined ? all : all.slice(0, props.limit);
});
</script>

<template>
  <p
    v-if="result.isPending.value"
    role="status"
    class="text-muted-foreground text-sm"
  >
    Loading activity…
  </p>
  <div v-else-if="result.isError.value">
    <p role="alert" class="form-error text-sm">Activity could not be loaded.</p>
    <Button class="mt-3" size="sm" variant="outline" @click="result.refetch()"
      >Try again</Button
    >
  </div>
  <div v-else-if="!items.length" class="empty-state py-6">
    <span class="empty-state-icon"
      ><Activity :size="22" aria-hidden="true"
    /></span>
    <h3>No activity yet</h3>
    <p>Expenses, payments, group changes, and comments will appear here.</p>
  </div>
  <div v-else>
    <ol class="divide-y" aria-label="Activity events">
      <li v-for="item in items" :key="item.id" class="flex gap-3 py-3">
        <img
          v-if="item.actor?.avatarUrl"
          :src="item.actor.avatarUrl"
          alt=""
          class="group-member-avatar"
        />
        <span v-else class="group-member-avatar" aria-hidden="true"
          ><Activity :size="16"
        /></span>
        <div class="min-w-0 flex-1 text-sm">
          <component
            :is="activityTarget(item) ? 'RouterLink' : 'p'"
            :to="activityTarget(item)"
            class="font-semibold"
            >{{ activityText(item) }}</component
          >
          <p
            v-if="
              typeof item.payload.amountMinor === 'string' &&
              typeof item.payload.currency === 'string'
            "
            class="tabular-nums mt-1"
          >
            {{
              formatCurrency(item.payload.amountMinor, item.payload.currency)
            }}
          </p>
          <time
            :datetime="item.occurredAt"
            class="text-muted-foreground mt-1 block text-xs"
          >
            {{ new Date(item.occurredAt).toLocaleString() }}
          </time>
        </div>
      </li>
    </ol>
    <Button
      v-if="limit === undefined && result.hasNextPage.value"
      class="mt-3"
      size="sm"
      variant="ghost"
      :disabled="result.isFetchingNextPage.value"
      @click="result.fetchNextPage()"
      >{{
        result.isFetchingNextPage.value ? "Loading…" : "Load more activity"
      }}</Button
    >
  </div>
</template>
