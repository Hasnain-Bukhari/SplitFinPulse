<script setup lang="ts">
import { useInfiniteQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import {
  api,
  type BalanceBreakdownFilters,
  type BalanceBreakdownPage,
} from "@/lib/api/client";

const props = defineProps<{ filters: BalanceBreakdownFilters }>();
const { formatCurrency } = useCurrencyFormatter();
const result = useInfiniteQuery(
  computed(() => ({
    queryKey: ["balances", "breakdown", props.filters],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.balanceBreakdown({
        ...props.filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: BalanceBreakdownPage) =>
      page.nextCursor ?? undefined,
  })),
);
const items = computed(
  () => result.data.value?.pages.flatMap((page) => page.items) ?? [],
);
</script>

<template>
  <div>
    <p
      v-if="result.isPending.value"
      class="text-muted-foreground text-sm"
      role="status"
    >
      Loading source expenses…
    </p>
    <p v-else-if="result.isError.value" class="form-error" role="alert">
      Source expenses could not be loaded.
    </p>
    <p v-else-if="!items.length" class="text-muted-foreground text-sm">
      No source expenses.
    </p>
    <ul v-else class="divide-y">
      <li
        v-for="item in items"
        :key="`${item.expense.id}:${item.counterparty.id}:${item.direction}`"
        class="py-3"
      >
        <RouterLink
          :to="`/expenses/${item.expense.id}`"
          class="focus-visible:ring-ring flex justify-between gap-3 rounded focus-visible:ring-2 focus-visible:outline-none"
        >
          <span
            ><strong class="block text-sm">{{
              item.expense.description
            }}</strong
            ><small class="text-muted-foreground"
              >{{ item.expense.expenseDate }} ·
              {{
                item.direction === "OWE"
                  ? `You owe ${item.counterparty.name}`
                  : `${item.counterparty.name} owes you`
              }}</small
            ></span
          >
          <strong class="tabular-nums text-sm">{{
            formatCurrency(item.amountMinor, item.expense.currency)
          }}</strong>
        </RouterLink>
      </li>
    </ul>
    <Button
      v-if="result.hasNextPage.value"
      variant="ghost"
      size="sm"
      :disabled="result.isFetchingNextPage.value"
      @click="result.fetchNextPage()"
      >Load more</Button
    >
  </div>
</template>
