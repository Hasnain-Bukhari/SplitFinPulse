<script setup lang="ts">
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import { computed } from "vue";
import { useRoute } from "vue-router";
import { History, Pencil, RotateCcw, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api, ApiError, type ExpenseRevisionPage } from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";
import ExpenseComments from "@/features/comments/ExpenseComments.vue";

const route = useRoute();
const queryClient = useQueryClient();
const id = computed(() => String(route.params.expenseId));
const { formatCurrency } = useCurrencyFormatter();
const session = useQuery(sessionQueryOptions);
const expense = useQuery(
  computed(() => ({
    queryKey: ["expenses", "detail", id.value],
    queryFn: () => api.expense(id.value),
  })),
);
const revisions = useInfiniteQuery(
  computed(() => ({
    queryKey: ["expenses", id.value, "revisions"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.expenseRevisions(id.value, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ExpenseRevisionPage) =>
      page.nextCursor ?? undefined,
    enabled: Boolean(expense.data.value),
  })),
);
const revisionItems = computed(
  () => revisions.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const currentUserEffect = computed(() => {
  const userId = session.data.value?.user.id;
  const data = expense.data.value;
  if (!userId || !data) return undefined;
  const paid =
    data.payers.find((item) => item.userId === userId)?.amountMinor ?? "0";
  const owed =
    data.splits.find((item) => item.userId === userId)?.owedMinor ?? "0";
  return (BigInt(paid) - BigInt(owed)).toString();
});
async function refresh(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["expenses"] });
  await queryClient.invalidateQueries({ queryKey: ["balances"] });
}
const remove = useMutation({
  mutationFn: () => api.deleteExpense(id.value, expense.data.value!.version),
  onSuccess: refresh,
});
const restore = useMutation({
  mutationFn: () => api.restoreExpense(id.value, expense.data.value!.version),
  onSuccess: refresh,
});
function removeExpense(): void {
  if (
    window.confirm(
      "Delete this expense? Its revision history will be preserved.",
    )
  )
    remove.mutate();
}
function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "This expense could not be loaded.";
}
function personName(id: string): string {
  const data = expense.data.value;
  return (
    data?.payers.find((item) => item.userId === id)?.user?.name ??
    data?.splits.find((item) => item.userId === id)?.user?.name ??
    "Participant"
  );
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4">
    <p
      v-if="expense.isPending.value"
      class="text-muted-foreground py-10"
      role="status"
    >
      Loading expense…
    </p>
    <Card v-else-if="expense.isError.value" class="p-5"
      ><p class="form-error" role="alert">
        {{ errorMessage(expense.error.value) }}
      </p></Card
    >
    <template v-else-if="expense.data.value">
      <Card class="p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="section-kicker">
              {{
                expense.data.value.status === "DELETED"
                  ? "Deleted expense"
                  : "Expense"
              }}
            </p>
            <h1 class="text-2xl font-bold">
              {{ expense.data.value.description }}
            </h1>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ expense.data.value.expenseDate }} · added by
              {{ expense.data.value.creator.name }}
            </p>
          </div>
          <strong class="tabular-nums text-xl">{{
            formatCurrency(
              expense.data.value.totalMinor,
              expense.data.value.currency,
            )
          }}</strong>
        </div>
        <p v-if="expense.data.value.notes" class="mt-4 text-sm">
          {{ expense.data.value.notes }}
        </p>
        <p
          v-if="currentUserEffect !== undefined"
          class="mt-3 text-sm font-semibold"
        >
          Your effect:
          {{ BigInt(currentUserEffect) < 0n ? "you owe" : "owed to you" }}
          {{
            formatCurrency(
              BigInt(currentUserEffect) < 0n
                ? (-BigInt(currentUserEffect)).toString()
                : currentUserEffect,
              expense.data.value.currency,
            )
          }}
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <Button
            v-if="
              expense.data.value.permissions.canEdit &&
              expense.data.value.status === 'ACTIVE'
            "
            as-child
            variant="outline"
            ><RouterLink :to="`/expenses/${id}/edit`"
              ><Pencil :size="15" /> Edit</RouterLink
            ></Button
          >
          <Button
            v-if="
              expense.data.value.permissions.canDelete &&
              expense.data.value.status === 'ACTIVE'
            "
            variant="outline"
            :disabled="remove.isPending.value"
            @click="removeExpense"
            ><Trash2 :size="15" /> Delete</Button
          >
          <Button
            v-if="
              expense.data.value.permissions.canRestore &&
              expense.data.value.status === 'DELETED'
            "
            :disabled="restore.isPending.value"
            @click="restore.mutate()"
            ><RotateCcw :size="15" /> Restore</Button
          >
        </div>
        <p
          v-if="remove.isError.value || restore.isError.value"
          class="form-error mt-3"
          role="alert"
        >
          {{ errorMessage(remove.error.value ?? restore.error.value) }}
        </p>
      </Card>

      <div class="grid gap-4 md:grid-cols-2">
        <Card class="p-5"
          ><p class="section-kicker">Paid</p>
          <h2 class="font-bold">Payers</h2>
          <ul class="mt-3 divide-y">
            <li
              v-for="item in expense.data.value.payers"
              :key="item.userId"
              class="flex justify-between gap-3 py-2 text-sm"
            >
              <span>{{ item.user?.name ?? personName(item.userId) }}</span
              ><strong class="tabular-nums">{{
                formatCurrency(item.amountMinor, expense.data.value.currency)
              }}</strong>
            </li>
          </ul></Card
        >
        <Card class="p-5"
          ><p class="section-kicker">{{ expense.data.value.splitMethod }}</p>
          <h2 class="font-bold">Owed amounts</h2>
          <ul class="mt-3 divide-y">
            <li
              v-for="item in expense.data.value.splits"
              :key="item.userId"
              class="flex justify-between gap-3 py-2 text-sm"
            >
              <span>{{ item.user?.name ?? personName(item.userId) }}</span
              ><strong class="tabular-nums">{{
                formatCurrency(item.owedMinor, expense.data.value.currency)
              }}</strong>
            </li>
          </ul></Card
        >
      </div>
      <Card class="p-5"
        ><p class="section-kicker">Discussion</p>
        <h2 class="mb-3 font-bold">Comments</h2>
        <ExpenseComments
          :expense-id="id"
          :writable="expense.data.value.status === 'ACTIVE'"
      /></Card>
      <Card class="p-5"
        ><p class="section-kicker">Auditable effect</p>
        <h2 class="font-bold">Who owes whom</h2>
        <p
          v-if="!expense.data.value.ledgerEntries.length"
          class="text-muted-foreground mt-3 text-sm"
        >
          This expense creates no outstanding obligation.
        </p>
        <ul v-else class="mt-3 divide-y">
          <li
            v-for="item in expense.data.value.ledgerEntries"
            :key="item.sequence"
            class="py-2 text-sm"
          >
            <strong>{{
              item.debtor?.name ?? personName(item.debtorId)
            }}</strong>
            owes
            <strong>{{
              item.creditor?.name ?? personName(item.creditorId)
            }}</strong>
            <span class="tabular-nums">{{
              formatCurrency(item.amountMinor, item.currency)
            }}</span>
          </li>
        </ul></Card
      >
      <Card class="p-5"
        ><div class="flex items-center gap-2">
          <History :size="18" />
          <div>
            <p class="section-kicker">History</p>
            <h2 class="font-bold">Revisions</h2>
          </div>
        </div>
        <ol class="mt-3 space-y-3">
          <li
            v-for="item in revisionItems"
            :key="item.id"
            class="border-border border-l-2 pl-4 text-sm"
          >
            <strong
              >Version {{ item.revisionNumber }} ·
              {{ item.action.toLowerCase() }}</strong
            >
            <p class="text-muted-foreground">
              {{ item.actor.name }} ·
              {{ new Date(item.createdAt).toLocaleString() }}
            </p>
            <p>
              {{ formatCurrency(item.totalMinor, item.currency) }} ·
              {{ item.splitMethod.toLowerCase() }}
            </p>
            <details class="mt-1">
              <summary class="cursor-pointer text-xs font-semibold">
                Allocation snapshot
              </summary>
              <ul class="mt-1 text-xs">
                <li v-for="payer in item.payers" :key="`payer:${payer.userId}`">
                  {{ payer.user?.name ?? personName(payer.userId) }} paid
                  {{ formatCurrency(payer.amountMinor, item.currency) }}
                </li>
                <li v-for="split in item.splits" :key="`split:${split.userId}`">
                  {{ split.user?.name ?? personName(split.userId) }} owed
                  {{ formatCurrency(split.owedMinor, item.currency) }}
                </li>
              </ul>
            </details>
          </li>
        </ol>
        <Button
          v-if="revisions.hasNextPage.value"
          class="mt-3"
          size="sm"
          variant="ghost"
          @click="revisions.fetchNextPage()"
          >Load older revisions</Button
        ></Card
      >
    </template>
  </div>
</template>
