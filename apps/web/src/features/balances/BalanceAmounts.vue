<script setup lang="ts">
import type { BalanceAmount } from "@/lib/api/client";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";

defineProps<{ amounts: BalanceAmount[] }>();
const { formatCurrency } = useCurrencyFormatter();
</script>

<template>
  <div v-if="amounts.length" class="grid gap-3 sm:grid-cols-3">
    <div
      v-for="item in amounts"
      :key="item.currency"
      class="border-border rounded-lg border p-3"
    >
      <strong class="block">{{ item.currency }}</strong>
      <dl class="mt-2 space-y-1 text-xs">
        <div class="flex justify-between gap-2">
          <dt>You owe</dt>
          <dd class="tabular-nums">
            {{ formatCurrency(item.youOweMinor, item.currency) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt>Owed to you</dt>
          <dd class="tabular-nums">
            {{ formatCurrency(item.youAreOwedMinor, item.currency) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2 border-t pt-1 font-bold">
          <dt>Net</dt>
          <dd class="tabular-nums">
            {{ formatCurrency(item.netMinor, item.currency) }}
          </dd>
        </div>
      </dl>
    </div>
  </div>
  <p v-else class="text-muted-foreground text-sm">No outstanding balances.</p>
</template>
