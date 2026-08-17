<script setup lang="ts">
import { useInfiniteQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BalanceAmounts from "@/features/balances/BalanceAmounts.vue";
import { api } from "@/lib/api/client";

const balances = useInfiniteQuery({
  queryKey: ["balances", "overall"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.balances(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const totals = computed(() => balances.data.value?.pages[0]?.totals ?? []);
const contexts = computed(
  () => balances.data.value?.pages.flatMap((page) => page.contexts) ?? [],
);
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-4">
    <div>
      <p class="section-kicker">Financial position</p>
      <h1 class="text-2xl font-bold">Balances</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Currencies remain separate. Every amount can be traced to its source
        expenses.
      </p>
    </div>
    <p
      v-if="balances.isPending.value"
      role="status"
      class="text-muted-foreground py-8"
    >
      Loading balances…
    </p>
    <Card v-else-if="balances.isError.value" class="p-5"
      ><p class="form-error" role="alert">
        Balances could not be loaded.
      </p></Card
    >
    <template v-else-if="balances.data.value">
      <Card class="p-5 sm:p-6"
        ><p class="section-kicker">Overall</p>
        <h2 class="mb-4 font-bold">Your position</h2>
        <BalanceAmounts :amounts="totals"
      /></Card>
      <div class="grid gap-4 md:grid-cols-2">
        <Card
          v-for="context in contexts"
          :key="`${context.contextType}:${context.contextId}`"
          class="p-5"
        >
          <p class="section-kicker">
            {{ context.contextType === "GROUP" ? "Group" : "Friend" }}
          </p>
          <h2 class="font-bold">{{ context.name }}</h2>
          <div class="mt-3"><BalanceAmounts :amounts="context.amounts" /></div>
          <RouterLink
            class="text-primary mt-4 inline-block text-sm font-semibold"
            :to="
              context.contextType === 'GROUP'
                ? `/groups/${context.contextId}/balances`
                : `/friends/${context.contextId}/balance`
            "
            >View details →</RouterLink
          >
        </Card>
      </div>
      <Button
        v-if="balances.hasNextPage.value"
        variant="outline"
        :disabled="balances.isFetchingNextPage.value"
        @click="balances.fetchNextPage()"
        >Load more balances</Button
      >
    </template>
  </div>
</template>
