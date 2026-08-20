<script setup lang="ts">
import { useInfiniteQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api, type SettlementPage } from "@/lib/api/client";

const props = defineProps<{ groupId?: string; friendshipId?: string }>();
const { formatCurrency } = useCurrencyFormatter();
const history = useInfiniteQuery(
  computed(() => ({
    queryKey: ["settlements", "history", props.groupId, props.friendshipId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.settlements({
        ...(props.groupId ? { groupId: props.groupId } : {}),
        ...(props.friendshipId ? { friendshipId: props.friendshipId } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: SettlementPage) => page.nextCursor ?? undefined,
  })),
);
const items = computed(
  () => history.data.value?.pages.flatMap((page) => page.items) ?? [],
);
</script>

<template>
  <p
    v-if="history.isPending.value"
    role="status"
    class="text-muted-foreground text-sm"
  >
    Loading payments…
  </p>
  <p v-else-if="history.isError.value" role="alert" class="form-error">
    Payment history could not be loaded.
  </p>
  <p v-else-if="!items.length" class="text-muted-foreground text-sm">
    No payments have been recorded.
  </p>
  <template v-else>
    <ul class="divide-y">
      <li v-for="item in items" :key="item.id" class="py-3">
        <RouterLink
          :to="`/settlements/${item.id}`"
          class="focus-visible:ring-ring flex justify-between gap-3 rounded focus-visible:ring-2 focus-visible:outline-none"
        >
          <span>
            <strong class="block text-sm"
              >{{ item.from.name }} paid {{ item.to.name }}</strong
            >
            <small class="text-muted-foreground"
              >{{ item.settledOn }} ·
              {{
                item.status === "REVERSED"
                  ? "Reversed"
                  : item.method.replaceAll("_", " ")
              }}</small
            >
          </span>
          <strong class="tabular-nums text-sm">{{
            formatCurrency(item.amountMinor, item.currency)
          }}</strong>
        </RouterLink>
      </li>
    </ul>
    <Button
      v-if="history.hasNextPage.value"
      variant="ghost"
      size="sm"
      :disabled="history.isFetchingNextPage.value"
      @click="history.fetchNextPage()"
    >
      Load more
    </Button>
  </template>
</template>
