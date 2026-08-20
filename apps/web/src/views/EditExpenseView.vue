<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ExpenseForm from "@/features/expenses/ExpenseForm.vue";
import { api, ApiError, type ExpenseWriteInput } from "@/lib/api/client";

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const id = computed(() => String(route.params.expenseId));
const conflict = ref(false);
const expense = useQuery(
  computed(() => ({
    queryKey: ["expenses", "detail", id.value],
    queryFn: () => api.expense(id.value),
  })),
);
const preferences = useQuery({
  queryKey: ["profile", "options"],
  queryFn: api.profileOptions,
});
const initial = computed<ExpenseWriteInput | undefined>(() =>
  expense.data.value
    ? {
        ...(expense.data.value.groupId
          ? { groupId: expense.data.value.groupId }
          : {}),
        ...(expense.data.value.friendshipId
          ? { friendshipId: expense.data.value.friendshipId }
          : {}),
        description: expense.data.value.description,
        totalMinor: expense.data.value.totalMinor,
        currency: expense.data.value.currency,
        expenseDate: expense.data.value.expenseDate,
        ...(expense.data.value.notes
          ? { notes: expense.data.value.notes }
          : {}),
        ...(expense.data.value.category?.id
          ? { categoryId: expense.data.value.category.id }
          : {}),
        payers: expense.data.value.payers.map(({ userId, amountMinor }) => ({
          userId,
          amountMinor,
        })),
        splitMethod: expense.data.value.splitMethod,
        participants: expense.data.value.splits.map(({ userId, input }) => ({
          userId,
          ...(input ? { input } : {}),
        })),
      }
    : undefined,
);
const update = useMutation({
  mutationFn: (input: ExpenseWriteInput) =>
    api.updateExpense(id.value, input, expense.data.value!.version),
  onSuccess: async (result) => {
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    await queryClient.invalidateQueries({ queryKey: ["balances"] });
    await router.push(`/expenses/${result.id}`);
  },
  onError: (error) => {
    if (error instanceof ApiError && error.code === "STALE_VERSION") {
      conflict.value = true;
    }
  },
});
const errorMessage = computed(() =>
  conflict.value
    ? "This expense changed elsewhere. Your draft is preserved; review the latest version before submitting again."
    : update.error.value instanceof ApiError
      ? update.error.value.message
      : "",
);
const people = computed(() => {
  const byId = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null }
  >();
  for (const item of [
    ...(expense.data.value?.payers ?? []),
    ...(expense.data.value?.splits ?? []),
  ]) {
    if (item.user) byId.set(item.user.id, item.user);
  }
  return [...byId.values()];
});
async function reviewLatest(): Promise<void> {
  await expense.refetch();
  conflict.value = false;
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <div>
      <p class="section-kicker">Revision</p>
      <h1 class="text-2xl font-bold">Edit expense</h1>
    </div>
    <Card v-if="conflict" class="p-4">
      <p class="form-error" role="alert">
        This expense changed elsewhere. Your draft is still preserved below.
      </p>
      <Button class="mt-3" variant="outline" size="sm" @click="reviewLatest">
        Load latest version and replace draft
      </Button>
    </Card>
    <p
      v-if="expense.isPending.value"
      role="status"
      class="text-muted-foreground py-8"
    >
      Loading expense…
    </p>
    <Card v-else-if="expense.isError.value || !initial" class="p-5"
      ><p role="alert" class="form-error">
        This expense could not be loaded.
      </p></Card
    >
    <ExpenseForm
      v-else
      :initial="initial"
      :people-override="people"
      :currencies="preferences.data.value?.currencies ?? []"
      :pending="update.isPending.value"
      :error="errorMessage"
      submit-label="Save revision"
      lock-context
      @submit="update.mutate"
    />
  </div>
</template>
