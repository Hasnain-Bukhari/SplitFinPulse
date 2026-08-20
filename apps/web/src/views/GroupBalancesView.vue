<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { Card } from "@/components/ui/card";
import BalanceAmounts from "@/features/balances/BalanceAmounts.vue";
import BalanceBreakdown from "@/features/balances/BalanceBreakdown.vue";
import SettlementHistory from "@/features/settlements/SettlementHistory.vue";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api } from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";

const route = useRoute();
const groupId = computed(() => String(route.params.groupId));
const showOriginal = ref(false);
const { formatCurrency } = useCurrencyFormatter();
const balances = useQuery(
  computed(() => ({
    queryKey: ["balances", "groups", groupId.value],
    queryFn: () => api.groupBalances(groupId.value),
  })),
);
const session = useQuery(sessionQueryOptions);
const transfers = computed(() => {
  const data = balances.data.value;
  if (!data) return [];
  return data.simplifyDebtsEnabled && !showOriginal.value
    ? data.recommendations
    : data.rawObligations;
});
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-4">
    <div>
      <p class="section-kicker">Group ledger</p>
      <h1 class="text-2xl font-bold">Group balances</h1>
    </div>
    <p
      v-if="balances.isPending.value"
      role="status"
      class="text-muted-foreground py-8"
    >
      Loading group balances…
    </p>
    <Card v-else-if="balances.isError.value" class="p-5"
      ><p class="form-error" role="alert">
        Group balances could not be loaded.
      </p></Card
    >
    <template v-else-if="balances.data.value">
      <Card class="p-5"
        ><p class="section-kicker">Your position</p>
        <BalanceAmounts class="mt-3" :amounts="balances.data.value.currentUser"
      /></Card>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card class="p-5"
          ><p class="section-kicker">Members</p>
          <h2 class="font-bold">Net positions</h2>
          <ul class="mt-3 divide-y">
            <li
              v-for="item in balances.data.value.positions"
              :key="`${item.user.id}:${item.currency}`"
              class="flex justify-between gap-3 py-2 text-sm"
            >
              <span>{{ item.user.name }}</span
              ><strong class="tabular-nums">{{
                formatCurrency(item.netMinor, item.currency)
              }}</strong>
            </li>
          </ul></Card
        >
        <Card class="p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="section-kicker">
                {{
                  balances.data.value.simplifyDebtsEnabled && !showOriginal
                    ? "Recommendations"
                    : "Recorded obligations"
                }}
              </p>
              <h2 class="font-bold">Transfers</h2>
            </div>
            <button
              v-if="balances.data.value.simplifyDebtsEnabled"
              class="text-primary text-xs font-semibold"
              type="button"
              @click="showOriginal = !showOriginal"
            >
              {{
                showOriginal
                  ? "View recommendations"
                  : "View original obligations"
              }}
            </button>
          </div>
          <p
            v-if="balances.data.value.simplifyDebtsEnabled && !showOriginal"
            class="text-muted-foreground mt-2 text-xs"
          >
            Recommendations preserve every member’s net position. They are not
            recorded payments.
          </p>
          <ul class="mt-3 divide-y">
            <li
              v-for="(item, index) in transfers"
              :key="`${item.from.id}:${item.to.id}:${index}`"
              class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span
                ><strong>{{ item.from.name }}</strong> pays
                <strong>{{ item.to.name }}</strong>
                <span class="tabular-nums">{{
                  formatCurrency(item.amountMinor, item.currency)
                }}</span></span
              >
              <RouterLink
                v-if="
                  item.from.id === session.data.value?.user.id ||
                  item.to.id === session.data.value?.user.id
                "
                class="text-primary rounded text-xs font-semibold focus-visible:ring-2"
                :to="`/settlements/new?groupId=${groupId}`"
                >Settle up</RouterLink
              >
            </li>
          </ul>
        </Card>
      </div>
      <Card class="p-5"
        ><p class="section-kicker">Traceability</p>
        <h2 class="mb-3 font-bold">Balance history</h2>
        <BalanceBreakdown :filters="{ groupId }"
      /></Card>
      <Card class="p-5"
        ><p class="section-kicker">Payments</p>
        <h2 class="mb-3 font-bold">Settlement history</h2>
        <SettlementHistory :group-id="groupId"
      /></Card>
    </template>
  </div>
</template>
