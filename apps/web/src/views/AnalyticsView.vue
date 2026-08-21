<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, reactive } from "vue";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { sessionQueryOptions } from "@/lib/query-client";
const session = useQuery(sessionQueryOptions);
const today = new Date();
const from = new Date(today);
from.setMonth(from.getMonth() - 5);
from.setDate(1);
const filters = reactive({
  dateFrom: from.toLocaleDateString("en-CA"),
  dateTo: today.toLocaleDateString("en-CA"),
  currency: "",
  metric: "YOUR_SHARE" as "YOUR_SHARE" | "WHOLE_EXPENSE",
});
const query = useQuery(
  computed(() => ({
    queryKey: [
      "analytics",
      {
        ...filters,
        currency: filters.currency || session.data.value?.user.defaultCurrency,
      },
    ],
    queryFn: () =>
      api.analytics({
        ...filters,
        currency:
          filters.currency || session.data.value?.user.defaultCurrency || "USD",
      }),
    enabled: Boolean(session.data.value),
  })),
);
const { formatCurrency } = useCurrencyFormatter();
const metricValue = (row: {
  yourShareMinor: string;
  wholeExpenseMinor: string;
}) =>
  filters.metric === "YOUR_SHARE" ? row.yourShareMinor : row.wholeExpenseMinor;
const categoryMax = computed(
  () =>
    query.data.value?.categories.items.reduce(
      (max, row) =>
        BigInt(metricValue(row)) > max ? BigInt(metricValue(row)) : max,
      0n,
    ) ?? 0n,
);
</script>
<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div>
      <p class="section-kicker">Insights</p>
      <h1 class="text-2xl font-bold">Spending analytics</h1>
    </div>
    <Card class="grid gap-3 p-4 sm:grid-cols-4"
      ><label>From<input v-model="filters.dateFrom" type="date" /></label
      ><label>To<input v-model="filters.dateTo" type="date" /></label
      ><label
        >Currency<input
          v-model="filters.currency"
          maxlength="3"
          :placeholder="session.data.value?.user.defaultCurrency" /></label
      ><label
        >Measure<select v-model="filters.metric">
          <option value="YOUR_SHARE">My share</option>
          <option value="WHOLE_EXPENSE">Whole expense</option>
        </select></label
      ></Card
    >
    <p v-if="query.isPending.value">Loading analytics…</p>
    <p v-else-if="query.isError.value" class="form-error">
      Analytics could not be loaded.
    </p>
    <template v-else-if="query.data.value"
      ><div class="grid gap-3 sm:grid-cols-3">
        <Card class="p-4"
          ><p>Expenses</p>
          <strong class="text-2xl">{{
            query.data.value.summary.expenseCount
          }}</strong></Card
        ><Card class="p-4"
          ><p>My share</p>
          <strong class="tabular-nums text-2xl">{{
            formatCurrency(
              query.data.value.summary.yourShareMinor,
              query.data.value.currency,
            )
          }}</strong></Card
        ><Card class="p-4"
          ><p>Whole expenses</p>
          <strong class="tabular-nums text-2xl">{{
            formatCurrency(
              query.data.value.summary.wholeExpenseMinor,
              query.data.value.currency,
            )
          }}</strong></Card
        >
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card class="p-5"
          ><h2 class="font-bold">Categories</h2>
          <ul class="mt-4 space-y-3">
            <li
              v-for="row in query.data.value.categories.items"
              :key="row.id ?? 'none'"
            >
              <div class="flex justify-between">
                <span>{{ row.name }}</span
                ><strong class="tabular-nums">{{
                  formatCurrency(metricValue(row), query.data.value.currency)
                }}</strong>
              </div>
              <div class="bg-muted mt-1 h-2 rounded">
                <div
                  class="bg-primary h-2 rounded"
                  :style="{
                    width: categoryMax
                      ? `${Number((BigInt(metricValue(row)) * 100n) / categoryMax)}%`
                      : '0%',
                  }"
                />
              </div>
            </li></ul></Card
        ><Card class="p-5"
          ><h2 class="font-bold">Monthly trend</h2>
          <table class="mt-3 w-full">
            <thead>
              <tr>
                <th class="text-left">Month</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in query.data.value.months" :key="row.month">
                <td>{{ row.month }}</td>
                <td class="tabular-nums text-right">
                  {{
                    formatCurrency(metricValue(row), query.data.value.currency)
                  }}
                </td>
              </tr>
            </tbody>
          </table></Card
        >
      </div>
      <Card class="p-5"
        ><h2 class="font-bold">Groups</h2>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2">
          <li
            v-for="row in query.data.value.groups.items"
            :key="row.id ?? 'outside'"
            class="flex justify-between rounded-lg border p-3"
          >
            <span>{{ row.name }}</span
            ><strong class="tabular-nums">{{
              formatCurrency(metricValue(row), query.data.value.currency)
            }}</strong>
          </li>
        </ul></Card
      ></template
    >
  </div>
</template>
