<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BalanceAmounts from "@/features/balances/BalanceAmounts.vue";
import BalanceBreakdown from "@/features/balances/BalanceBreakdown.vue";
import SettlementHistory from "@/features/settlements/SettlementHistory.vue";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api } from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";

const route = useRoute();
const friendshipId = computed(() => String(route.params.friendshipId));
const { formatCurrency } = useCurrencyFormatter();
const reportingCurrency = ref("");
const session = useQuery(sessionQueryOptions);
const currencies = useQuery({
  queryKey: ["profile", "options"],
  queryFn: () => api.profileOptions(),
});
watch(
  () => session.data.value?.user.defaultCurrency,
  (value) => {
    if (value && !reportingCurrency.value) reportingCurrency.value = value;
  },
  { immediate: true },
);
const balances = useQuery(
  computed(() => ({
    queryKey: [
      "balances",
      "friends",
      friendshipId.value,
      reportingCurrency.value,
    ],
    queryFn: () =>
      api.friendBalances(
        friendshipId.value,
        reportingCurrency.value || undefined,
      ),
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
        <div class="flex gap-2">
          <Button
            v-if="
              balances.data.value.amounts.some(
                (amount) => amount.netMinor !== '0',
              )
            "
            as-child
            ><RouterLink :to="`/settlements/new?friendshipId=${friendshipId}`"
              >Settle up</RouterLink
            ></Button
          >
          <Button as-child variant="outline"
            ><RouterLink :to="`/expenses/new?friendshipId=${friendshipId}`"
              >Add expense</RouterLink
            ></Button
          >
        </div>
        <label class="text-sm"
          >Reporting currency
          <select v-model="reportingCurrency" class="ml-2">
            <option value="">Native only</option>
            <option
              v-for="item in currencies.data.value?.currencies ?? []"
              :key="item.code"
              :value="item.code"
            >
              {{ item.code }} — {{ item.name }}
            </option>
          </select></label
        >
      </div>
      <Card class="p-5"
        ><BalanceAmounts :amounts="balances.data.value.amounts"
      /></Card>
      <Card v-if="balances.data.value.convertedSummary" class="p-5">
        <p class="section-kicker">Converted view</p>
        <strong class="tabular-nums text-lg">{{
          formatCurrency(
            balances.data.value.convertedSummary.netMinor,
            balances.data.value.convertedSummary.reportingCurrency,
          )
        }}</strong>
        <p class="text-muted-foreground mt-1 text-xs">
          Write-time snapshots ·
          {{
            balances.data.value.convertedSummary.incomplete
              ? "incomplete; native balances remain authoritative"
              : "all entries converted"
          }}
        </p>
      </Card>
      <Card class="p-5"
        ><p class="section-kicker">Traceability</p>
        <h2 class="mb-3 font-bold">Balance history</h2>
        <BalanceBreakdown :filters="{ friendshipId }"
      /></Card>
      <Card class="p-5"
        ><p class="section-kicker">Payments</p>
        <h2 class="mb-3 font-bold">Settlement history</h2>
        <SettlementHistory :friendship-id="friendshipId"
      /></Card>
    </template>
  </div>
</template>
