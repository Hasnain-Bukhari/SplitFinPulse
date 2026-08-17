<script setup lang="ts">
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ExpenseForm from "@/features/expenses/ExpenseForm.vue";
import { createIdempotencyKeyTracker } from "@/features/expenses/idempotency";
import { api, ApiError, type ExpenseWriteInput } from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const session = useQuery(sessionQueryOptions);
const preferences = useQuery({
  queryKey: ["profile", "options"],
  queryFn: api.profileOptions,
});
const groups = useInfiniteQuery({
  queryKey: ["groups", "expense-picker"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.groups("ACTIVE", pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const friends = useInfiniteQuery({
  queryKey: ["friends", "accepted", "expense-picker"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.friends(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const groupItems = computed(
  () => groups.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const friendItems = computed(
  () => friends.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const idempotency = createIdempotencyKeyTracker();
watch(
  () => [groups.hasNextPage.value, groups.isFetchingNextPage.value] as const,
  ([hasNext, fetching]) => {
    if (hasNext && !fetching) void groups.fetchNextPage();
  },
  { immediate: true },
);
watch(
  () => [friends.hasNextPage.value, friends.isFetchingNextPage.value] as const,
  ([hasNext, fetching]) => {
    if (hasNext && !fetching) void friends.fetchNextPage();
  },
  { immediate: true },
);
const initial = computed<ExpenseWriteInput | undefined>(() => {
  const groupId =
    typeof route.query.groupId === "string" ? route.query.groupId : undefined;
  const friendshipId =
    typeof route.query.friendshipId === "string"
      ? route.query.friendshipId
      : undefined;
  if (!groupId && !friendshipId) return undefined;
  const group = groupItems.value.find((item) => item.id === groupId);
  return {
    ...(groupId ? { groupId } : {}),
    ...(friendshipId ? { friendshipId } : {}),
    description: "",
    totalMinor: "0",
    currency:
      group?.defaultCurrency ??
      session.data.value?.user.defaultCurrency ??
      "USD",
    expenseDate: new Date().toLocaleDateString("en-CA"),
    payers: [],
    splitMethod: "EQUAL",
    participants: [],
  };
});
const create = useMutation({
  mutationFn: (input: ExpenseWriteInput) =>
    api.createExpense(input, idempotency.forInput(input)),
  onSuccess: async (expense) => {
    idempotency.reset();
    await queryClient.invalidateQueries({ queryKey: ["balances"] });
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    await router.push(`/expenses/${expense.id}`);
  },
});
const errorMessage = computed(() =>
  create.error.value instanceof ApiError
    ? create.error.value.message
    : create.isError.value
      ? "The expense could not be created."
      : "",
);
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <div>
      <p class="section-kicker">Financial core</p>
      <h1 class="text-2xl font-bold">Add an expense</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Record who paid, choose a split, then review the exact ledger effect.
      </p>
    </div>
    <ExpenseForm
      :key="initial?.groupId ?? initial?.friendshipId ?? 'new'"
      :initial="initial"
      :groups="groupItems"
      :friends="friendItems"
      :currencies="preferences.data.value?.currencies ?? []"
      :pending="create.isPending.value"
      :error="errorMessage"
      @submit="create.mutate"
    />
  </div>
</template>
