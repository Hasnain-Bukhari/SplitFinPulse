<script setup lang="ts">
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ExpenseForm from "@/features/expenses/ExpenseForm.vue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  api,
  ApiError,
  type ExpenseWriteInput,
  type RecurringExpenseInput,
} from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";

const router = useRouter();
const route = useRoute();
const scheduleId = computed(() =>
  route.params.id ? String(route.params.id) : undefined,
);
const session = useQuery(sessionQueryOptions);
const existing = useQuery(
  computed(() => ({
    queryKey: ["recurring-expenses", scheduleId.value],
    queryFn: () => api.recurringExpense(scheduleId.value!),
    enabled: Boolean(scheduleId.value),
  })),
);
const preferences = useQuery({
  queryKey: ["profile", "options"],
  queryFn: api.profileOptions,
});
const groups = useInfiniteQuery({
  queryKey: ["groups", "recurring-picker"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.groups("ACTIVE", pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const friends = useInfiniteQuery({
  queryKey: ["friends", "recurring-picker"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.friends(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const schedule = reactive<{
  unit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  interval: number;
  weekdays: number[];
  anchorDate: string;
  localTime: string;
  timezone: string;
  endDate: string;
}>({
  unit: "MONTH",
  interval: 1,
  weekdays: [new Date().getDay() || 7],
  anchorDate: new Date().toLocaleDateString("en-CA"),
  localTime: "09:00",
  timezone: "",
  endDate: "",
});
const pendingInput = ref<RecurringExpenseInput>();
const initialTemplate = computed<ExpenseWriteInput | undefined>(() => {
  const row = existing.data.value;
  if (!row?.template) return undefined;
  return {
    ...(row.groupId ? { groupId: row.groupId } : {}),
    ...(row.friendshipId ? { friendshipId: row.friendshipId } : {}),
    description: row.template.description,
    totalMinor: row.template.totalMinor,
    currency: row.template.currency,
    expenseDate:
      row.schedule?.anchorDate ?? new Date().toLocaleDateString("en-CA"),
    ...(row.template.notes ? { notes: row.template.notes } : {}),
    ...(row.template.categoryId ? { categoryId: row.template.categoryId } : {}),
    splitMethod: row.template.splitMethod,
    payers: row.template.payers,
    participants: row.template.participants.map((item) => ({
      userId: item.userId,
      ...(item.input ? { input: item.input } : {}),
    })),
  };
});
watch(
  () => existing.data.value?.schedule,
  (value) => {
    if (!value) return;
    Object.assign(schedule, {
      ...value,
      endDate: value.endDate ?? "",
    });
  },
  { immediate: true },
);
const prepare = useMutation({
  mutationFn: async (template: ExpenseWriteInput) => {
    const cleanTemplate = { ...template };
    delete cleanTemplate.attachmentIds;
    delete cleanTemplate.valuationId;
    const input: RecurringExpenseInput = {
      template: cleanTemplate,
      schedule: {
        unit: schedule.unit,
        interval: schedule.interval,
        ...(schedule.unit === "WEEK" ? { weekdays: schedule.weekdays } : {}),
        anchorDate: schedule.anchorDate,
        localTime: schedule.localTime,
        timezone:
          schedule.timezone || session.data.value?.user.timezone || "UTC",
        ...(schedule.endDate ? { endDate: schedule.endDate } : {}),
      },
    };
    const result = await api.previewRecurringExpense(input);
    pendingInput.value = input;
    return result;
  },
});
const preview = computed(() => prepare.data.value?.occurrences ?? []);
const create = useMutation({
  mutationFn: () => {
    if (!pendingInput.value) throw new Error("Preview the schedule first");
    return scheduleId.value && existing.data.value
      ? api.updateRecurringExpense(
          scheduleId.value,
          existing.data.value.version,
          pendingInput.value,
        )
      : api.createRecurringExpense(pendingInput.value, crypto.randomUUID());
  },
  onSuccess: (created) => router.push(`/recurring-expenses/${created.id}`),
});
const error = computed(() =>
  (prepare.error.value ?? create.error.value) instanceof ApiError
    ? ((prepare.error.value ?? create.error.value) as ApiError).message
    : prepare.isError.value || create.isError.value
      ? "The recurring expense could not be created."
      : "",
);
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <div>
      <p class="section-kicker">Automation</p>
      <h1 class="text-2xl font-bold">
        {{ scheduleId ? "Edit" : "Create" }} recurring expense
      </h1>
    </div>
    <Card class="form-grid p-5 sm:p-6"
      ><h2 class="text-lg font-bold">Schedule</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <label
          >Frequency<select v-model="schedule.unit">
            <option value="DAY">Daily</option>
            <option value="WEEK">Weekly</option>
            <option value="MONTH">Monthly</option>
            <option value="YEAR">Yearly</option>
          </select></label
        ><label
          >Interval<input
            v-model.number="schedule.interval"
            type="number"
            min="1"
            max="365" /></label
        ><label
          >Start date<input v-model="schedule.anchorDate" type="date" /></label
        ><label
          >Local time<input v-model="schedule.localTime" type="time" /></label
        ><label
          >Timezone<input
            v-model="schedule.timezone"
            :placeholder="session.data.value?.user.timezone" /></label
        ><label
          >End date (optional)<input v-model="schedule.endDate" type="date"
        /></label>
      </div>
      <fieldset v-if="schedule.unit === 'WEEK'">
        <legend>Weekdays</legend>
        <label
          v-for="(name, index) in [
            'Mon',
            'Tue',
            'Wed',
            'Thu',
            'Fri',
            'Sat',
            'Sun',
          ]"
          :key="name"
          class="mr-3 inline-flex gap-1"
          ><input
            v-model="schedule.weekdays"
            type="checkbox"
            :value="index + 1"
          />{{ name }}</label
        >
      </fieldset>
      <ul v-if="preview.length">
        <li v-for="item in preview" :key="item.occurrenceKey">
          {{ item.localDate }} {{ item.localTime }}
        </li>
      </ul>
      <Button
        v-if="pendingInput && preview.length"
        :disabled="create.isPending.value"
        @click="create.mutate()"
        >Confirm recurring expense</Button
      ></Card
    ><ExpenseForm
      recurring
      :initial="initialTemplate"
      :groups="groups.data.value?.pages.flatMap((page) => page.items) ?? []"
      :friends="friends.data.value?.pages.flatMap((page) => page.items) ?? []"
      :currencies="preferences.data.value?.currencies ?? []"
      :pending="prepare.isPending.value"
      :error="error"
      :submit-label="scheduleId ? 'Preview changes' : 'Preview schedule'"
      @submit="prepare.mutate"
    />
  </div>
</template>
