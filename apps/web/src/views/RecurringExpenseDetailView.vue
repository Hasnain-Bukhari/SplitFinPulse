<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute } from "vue-router";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
const id = String(useRoute().params.id);
const client = useQueryClient();
const schedule = useQuery({
  queryKey: ["recurring-expenses", id],
  queryFn: () => api.recurringExpense(id),
});
const occurrences = useQuery({
  queryKey: ["recurring-expenses", id, "occurrences"],
  queryFn: () => api.recurringOccurrences(id),
});
const refresh = () =>
  client.invalidateQueries({ queryKey: ["recurring-expenses", id] });
const pause = useMutation({
  mutationFn: () => api.pauseRecurringExpense(id, schedule.data.value!.version),
  onSuccess: refresh,
});
const resume = useMutation({
  mutationFn: () =>
    api.resumeRecurringExpense(id, schedule.data.value!.version),
  onSuccess: refresh,
});
const retry = useMutation({
  mutationFn: (occurrenceId: string) =>
    api.retryRecurringOccurrence(id, occurrenceId),
  onSuccess: () =>
    client.invalidateQueries({
      queryKey: ["recurring-expenses", id, "occurrences"],
    }),
});
</script>
<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <p v-if="schedule.isPending.value">Loading schedule…</p>
    <template v-else-if="schedule.data.value"
      ><div>
        <p class="section-kicker">Recurring expense</p>
        <h1 class="text-2xl font-bold">
          {{ schedule.data.value.template?.description }}
        </h1>
        <p>
          {{ schedule.data.value.status }} ·
          {{ schedule.data.value.schedule?.timezone }}
        </p>
        <div
          v-if="schedule.data.value.permissions.canManage"
          class="mt-3 flex flex-wrap gap-2"
        >
          <Button as-child variant="outline"
            ><RouterLink :to="`/recurring-expenses/${id}/edit`"
              >Edit future occurrences</RouterLink
            ></Button
          >
          <Button
            v-if="schedule.data.value.status === 'ACTIVE'"
            variant="outline"
            :disabled="pause.isPending.value"
            @click="pause.mutate()"
            >Pause</Button
          >
          <Button
            v-if="schedule.data.value.status === 'PAUSED'"
            variant="outline"
            :disabled="resume.isPending.value"
            @click="resume.mutate()"
            >Resume</Button
          >
        </div>
      </div>
      <Card class="p-5"
        ><h2 class="font-bold">Occurrence history</h2>
        <ul class="mt-3 divide-y">
          <li
            v-for="item in occurrences.data.value?.items"
            :key="item.id"
            class="flex justify-between gap-3 py-3"
          >
            <span>{{ item.localDate }}</span
            ><RouterLink
              v-if="item.expenseId"
              :to="`/expenses/${item.expenseId}`"
              >View expense</RouterLink
            ><span v-else class="flex items-center gap-2"
              >{{ item.status
              }}<template v-if="item.lastErrorCode">
                · {{ item.lastErrorCode }}</template
              ><Button
                v-if="
                  item.id &&
                  item.status === 'FAILED' &&
                  schedule.data.value.permissions.canManage
                "
                size="sm"
                variant="outline"
                :disabled="retry.isPending.value"
                @click="retry.mutate(item.id)"
                >Retry</Button
              ></span
            >
          </li>
        </ul></Card
      ></template
    >
  </div>
</template>
