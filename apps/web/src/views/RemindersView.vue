<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ref } from "vue";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
const direction = ref<"sent" | "received">("sent");
const client = useQueryClient();
const reminders = useQuery({
  queryKey: ["reminders", direction],
  queryFn: () => api.reminders(direction.value),
});
const cancel = useMutation({
  mutationFn: api.cancelReminder,
  onSuccess: () => client.invalidateQueries({ queryKey: ["reminders"] }),
});
const { formatCurrency } = useCurrencyFormatter();
</script>
<template>
  <div class="mx-auto max-w-4xl space-y-5">
    <div>
      <p class="section-kicker">Payments</p>
      <h1 class="text-2xl font-bold">Reminder history</h1>
    </div>
    <div class="flex gap-2">
      <Button
        :variant="direction === 'sent' ? 'default' : 'outline'"
        @click="direction = 'sent'"
        >Sent</Button
      ><Button
        :variant="direction === 'received' ? 'default' : 'outline'"
        @click="direction = 'received'"
        >Received</Button
      >
    </div>
    <p v-if="reminders.isPending.value">Loading reminders…</p>
    <Card v-else-if="!reminders.data.value?.items.length" class="p-6"
      >No reminders yet.</Card
    >
    <ul v-else class="space-y-2">
      <li v-for="item in reminders.data.value?.items" :key="item.id">
        <Card class="flex items-center justify-between gap-4 p-4"
          ><div>
            <strong>{{ item.status }}</strong>
            <p class="tabular-nums text-sm">
              {{
                formatCurrency(
                  item.processedAmountMinor ?? item.outstandingMinor,
                  item.currency,
                )
              }}
              · {{ new Date(item.scheduledFor).toLocaleString() }}
            </p>
            <p v-if="item.outcomeCode" class="text-muted-foreground text-xs">
              {{ item.outcomeCode }}
            </p>
          </div>
          <Button
            v-if="direction === 'sent' && item.status === 'SCHEDULED'"
            size="sm"
            variant="outline"
            @click="cancel.mutate(item.id)"
            >Cancel</Button
          ></Card
        >
      </li>
    </ul>
  </div>
</template>
