<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive } from "vue";
import { api, type BudgetInput } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sessionQueryOptions } from "@/lib/query-client";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
const client = useQueryClient();
const session = useQuery(sessionQueryOptions);
const month = new Date().toISOString().slice(0, 7);
const budgets = useQuery({
  queryKey: ["budgets", month],
  queryFn: () => api.budgets(month),
});
const categories = useQuery({
  queryKey: ["categories", "active"],
  queryFn: () => api.categories(),
});
const groups = useQuery({
  queryKey: ["groups", "budget"],
  queryFn: () => api.groups("ACTIVE"),
});
const form = reactive<BudgetInput>({
  scope: "PERSONAL",
  currency: "",
  amountMinor: "",
  startMonth: month,
});
const create = useMutation({
  mutationFn: () =>
    api.createBudget({
      ...form,
      currency:
        form.currency || session.data.value?.user.defaultCurrency || "USD",
    }),
  onSuccess: () => client.invalidateQueries({ queryKey: ["budgets"] }),
});
const archive = useMutation({
  mutationFn: ({ id, version }: { id: string; version: number }) =>
    api.archiveBudget(id, version),
  onSuccess: () => client.invalidateQueries({ queryKey: ["budgets"] }),
});
const { formatCurrency } = useCurrencyFormatter();
const error = computed(() =>
  create.isError.value ? "Budget could not be saved." : "",
);
</script>
<template>
  <div class="mx-auto max-w-5xl space-y-5">
    <div>
      <p class="section-kicker">Monthly limits</p>
      <h1 class="text-2xl font-bold">Budgets</h1>
    </div>
    <Card class="form-grid p-5"
      ><h2 class="font-bold">Create budget</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <label
          >Scope<select v-model="form.scope">
            <option value="PERSONAL">Personal</option>
            <option value="CATEGORY">Category</option>
            <option value="GROUP">Group</option>
          </select></label
        ><label v-if="form.scope === 'CATEGORY'"
          >Category<select v-model="form.categoryId">
            <option
              v-for="item in categories.data.value?.items"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select></label
        ><label v-if="form.scope === 'GROUP'"
          >Group<select v-model="form.groupId">
            <option
              v-for="item in groups.data.value?.items.filter((group) =>
                ['OWNER', 'ADMIN'].includes(group.currentUserRole),
              )"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select></label
        ><label
          >Amount (minor units)<input
            v-model="form.amountMinor"
            inputmode="numeric"
            placeholder="50000" /></label
        ><label
          >Currency<input
            v-model="form.currency"
            maxlength="3"
            :placeholder="session.data.value?.user.defaultCurrency" /></label
        ><label
          >Start month<input v-model="form.startMonth" type="month"
        /></label>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <Button :disabled="create.isPending.value" @click="create.mutate()"
        >Create budget</Button
      ></Card
    >
    <p v-if="budgets.isPending.value">Loading budgets…</p>
    <Card v-else-if="!budgets.data.value?.items.length" class="p-6"
      >No active budgets for {{ month }}.</Card
    >
    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li v-for="item in budgets.data.value?.items" :key="item.id">
        <Card class="p-5"
          ><div class="flex justify-between">
            <strong>{{
              item.group?.name ?? item.category?.name ?? "Personal"
            }}</strong
            ><span>{{ item.scope }}</span>
          </div>
          <p class="tabular-nums mt-2">
            {{ formatCurrency(item.spentMinor, item.currency) }} of
            {{ formatCurrency(item.amountMinor, item.currency) }}
          </p>
          <progress
            class="mt-2 w-full"
            :value="Math.min(item.percentUsed, 100)"
            max="100"
            :aria-label="`${item.percentUsed}% of budget used`"
          />
          <p class="text-muted-foreground text-sm">
            {{ item.percentUsed.toFixed(1) }}% used · alerts at 80% and 100%
          </p>
          <Button
            v-if="item.permissions.canManage"
            class="mt-3"
            size="sm"
            variant="outline"
            @click="archive.mutate({ id: item.id, version: item.version })"
            >Archive</Button
          ></Card
        >
      </li>
    </ul>
  </div>
</template>
