<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BalanceAmounts from "@/features/balances/BalanceAmounts.vue";
import BalanceBreakdown from "@/features/balances/BalanceBreakdown.vue";
import { api } from "@/lib/api/client";

const route = useRoute();
const friendshipId = computed(() => String(route.params.friendshipId));
const balances = useQuery(
  computed(() => ({
    queryKey: ["balances", "friends", friendshipId.value],
    queryFn: () => api.friendBalances(friendshipId.value),
  })),
);
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <p
      v-if="balances.isPending.value"
      role="status"
      class="text-muted-foreground py-8"
    >
      Loading friend balance…
    </p>
    <Card v-else-if="balances.isError.value" class="p-5"
      ><p class="form-error" role="alert">
        Friend balance could not be loaded.
      </p></Card
    >
    <template v-else-if="balances.data.value">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="section-kicker">Friend balance</p>
          <h1 class="text-2xl font-bold">
            {{ balances.data.value.friend.name }}
          </h1>
        </div>
        <Button as-child
          ><RouterLink :to="`/expenses/new?friendshipId=${friendshipId}`"
            >Add expense</RouterLink
          ></Button
        >
      </div>
      <Card class="p-5"
        ><BalanceAmounts :amounts="balances.data.value.amounts"
      /></Card>
      <Card class="p-5"
        ><p class="section-kicker">Traceability</p>
        <h2 class="mb-3 font-bold">Source expenses</h2>
        <BalanceBreakdown :filters="{ friendshipId }"
      /></Card>
    </template>
  </div>
</template>
