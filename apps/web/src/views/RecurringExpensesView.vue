<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";

const queryClient = useQueryClient();
const schedules = useQuery({
  queryKey: ["recurring-expenses"],
  queryFn: () => api.recurringExpenses(),
});
const action = useMutation({
  mutationFn: ({
    id,
    version,
    type,
  }: {
    id: string;
    version: number;
    type: "pause" | "resume";
  }) =>
    type === "pause"
      ? api.pauseRecurringExpense(id, version)
      : api.resumeRecurringExpense(id, version),
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: ["recurring-expenses"] }),
});
const { formatCurrency } = useCurrencyFormatter();
const error = computed(() =>
  schedules.isError.value ? "Recurring expenses could not be loaded." : "",
);
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5">
    <div class="section-heading">
      <div>
        <p class="section-kicker">Automation</p>
        <h1 class="text-2xl font-bold">Recurring expenses</h1>
      </div>
      <Button as-child
        ><RouterLink to="/recurring-expenses/new"
          >Create schedule</RouterLink
        ></Button
      >
    </div>
    <p v-if="schedules.isPending.value" role="status">
      Loading recurring expenses…
    </p>
    <p v-else-if="error" class="form-error" role="alert">{{ error }}</p>
    <Card v-else-if="!schedules.data.value?.items.length" class="p-6"
      ><h2 class="font-bold">No schedules yet</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        Create a schedule for expenses that repeat.
      </p></Card
    >
    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li v-for="item in schedules.data.value?.items" :key="item.id">
        <Card class="h-full p-5"
          ><div class="flex items-start justify-between gap-3">
            <div>
              <RouterLink
                :to="`/recurring-expenses/${item.id}`"
                class="font-bold"
                >{{ item.template?.description }}</RouterLink
              >
              <p class="tabular-nums mt-1">
                {{
                  formatCurrency(
                    item.template?.totalMinor ?? "0",
                    item.template?.currency ?? "USD",
                  )
                }}
              </p>
            </div>
            <span class="rounded-full border px-2 py-1 text-xs">{{
              item.status
            }}</span>
          </div>
          <p class="text-muted-foreground mt-3 text-sm">
            Every {{ item.schedule?.interval }}
            {{ item.schedule?.unit.toLowerCase() }} ·
            {{ item.schedule?.timezone }}
          </p>
          <p class="mt-1 text-sm">
            Next:
            {{
              item.nextRunAt
                ? new Date(item.nextRunAt).toLocaleString()
                : "None"
            }}
          </p>
          <p v-if="item.lastFailureCode" class="form-error mt-2">
            Paused: {{ item.lastFailureCode }}
          </p>
          <Button
            class="mt-4"
            size="sm"
            variant="outline"
            :disabled="action.isPending.value"
            @click="
              action.mutate({
                id: item.id,
                version: item.version,
                type: item.status === 'ACTIVE' ? 'pause' : 'resume',
              })
            "
            >{{ item.status === "ACTIVE" ? "Pause" : "Resume" }}</Button
          ></Card
        >
      </li>
    </ul>
  </div>
</template>
