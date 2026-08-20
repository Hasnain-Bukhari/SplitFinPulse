<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api, ApiError } from "@/lib/api/client";

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const id = computed(() => String(route.params.settlementId));
const reason = ref("");
const showReverse = ref(false);
const errorMessage = ref("");
const { formatCurrency } = useCurrencyFormatter();
const detail = useQuery(
  computed(() => ({
    queryKey: ["settlements", "detail", id.value],
    queryFn: () => api.settlement(id.value),
  })),
);
const revisions = useQuery(
  computed(() => ({
    queryKey: ["settlements", "revisions", id.value],
    queryFn: () => api.settlementRevisions(id.value),
  })),
);
const reverse = useMutation({
  mutationFn: () =>
    api.correctSettlement(
      id.value,
      detail.data.value!.version,
      reason.value.trim(),
      undefined,
      crypto.randomUUID(),
    ),
  onSuccess: async () => {
    showReverse.value = false;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["settlements"] }),
      queryClient.invalidateQueries({ queryKey: ["balances"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["search"] }),
    ]);
  },
  onError: (error) => {
    errorMessage.value =
      error instanceof ApiError
        ? error.message
        : "The payment could not be reversed.";
  },
});
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <p
      v-if="detail.isPending.value"
      role="status"
      class="text-muted-foreground py-8"
    >
      Loading payment…
    </p>
    <Card v-else-if="detail.isError.value" class="p-5"
      ><p role="alert" class="form-error">Payment could not be loaded.</p></Card
    >
    <template v-else-if="detail.data.value">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="section-kicker">Payment</p>
          <h1 class="text-2xl font-bold">
            {{ detail.data.value.from.name }} paid
            {{ detail.data.value.to.name }}
          </h1>
        </div>
        <span class="rounded-full border px-3 py-1 text-xs font-semibold">{{
          detail.data.value.status === "REVERSED" ? "Reversed" : "Recorded"
        }}</span>
      </div>
      <Card class="p-5 sm:p-6">
        <strong class="tabular-nums text-3xl">{{
          formatCurrency(
            detail.data.value.amountMinor,
            detail.data.value.currency,
          )
        }}</strong>
        <dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted-foreground">Date</dt>
            <dd>{{ detail.data.value.settledOn }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Method</dt>
            <dd>
              {{
                detail.data.value.methodLabel ||
                detail.data.value.method.replaceAll("_", " ")
              }}
            </dd>
          </div>
          <div v-if="detail.data.value.note" class="sm:col-span-2">
            <dt class="text-muted-foreground">Note</dt>
            <dd class="whitespace-pre-wrap">{{ detail.data.value.note }}</dd>
          </div>
          <div v-if="detail.data.value.reversalReason" class="sm:col-span-2">
            <dt class="text-muted-foreground">Reversal reason</dt>
            <dd>{{ detail.data.value.reversalReason }}</dd>
          </div>
          <div v-if="detail.data.value.valuation" class="sm:col-span-2">
            <dt class="text-muted-foreground">Conversion snapshot</dt>
            <dd>
              {{ detail.data.value.valuation.source }} · effective
              {{ detail.data.value.valuation.effectiveDate }} ·
              {{ detail.data.value.valuation.status.toLowerCase() }}
            </dd>
          </div>
        </dl>
        <div
          v-if="detail.data.value.status === 'ACTIVE'"
          class="mt-6 flex flex-wrap gap-2"
        >
          <Button
            v-if="detail.data.value.permissions.canCorrect"
            variant="outline"
            @click="router.push(`/settlements/${id}/correct`)"
            >Correct</Button
          >
          <Button
            v-if="detail.data.value.permissions.canReverse"
            variant="outline"
            @click="showReverse = true"
            >Reverse</Button
          >
        </div>
        <p v-if="detail.data.value.replacesSettlementId" class="mt-4 text-sm">
          This payment replaces
          <RouterLink
            class="text-primary font-semibold"
            :to="`/settlements/${detail.data.value.replacesSettlementId}`"
            >an earlier payment</RouterLink
          >.
        </p>
        <p
          v-if="detail.data.value.replacementSettlementId"
          class="mt-4 text-sm"
        >
          A
          <RouterLink
            class="text-primary font-semibold"
            :to="`/settlements/${detail.data.value.replacementSettlementId}`"
            >corrected payment</RouterLink
          >
          replaced this record.
        </p>
      </Card>
      <Card v-if="showReverse" class="p-5">
        <h2 class="font-bold">Reverse this payment?</h2>
        <p class="text-muted-foreground mt-1 text-sm">
          This restores the balance and keeps an immutable history entry.
        </p>
        <label class="mt-4 block"
          >Reason<input v-model="reason" maxlength="500" required
        /></label>
        <p v-if="errorMessage" class="form-error mt-2" role="alert">
          {{ errorMessage }}
        </p>
        <div class="mt-4 flex gap-2">
          <Button
            :disabled="!reason.trim() || reverse.isPending.value"
            @click="reverse.mutate()"
            >Confirm reversal</Button
          ><Button variant="ghost" @click="showReverse = false">Cancel</Button>
        </div>
      </Card>
      <Card class="p-5">
        <p class="section-kicker">Audit trail</p>
        <h2 class="font-bold">Revision history</h2>
        <p
          v-if="revisions.isPending.value"
          role="status"
          class="text-muted-foreground mt-3 text-sm"
        >
          Loading history…
        </p>
        <ul v-else class="mt-3 divide-y">
          <li
            v-for="item in revisions.data.value?.items ?? []"
            :key="`${item.id}:${item.revisionNumber}`"
            class="py-3 text-sm"
          >
            <strong>{{
              item.action === "REVERSED"
                ? "Reversed"
                : item.action === "REPLACED"
                  ? "Replacement recorded"
                  : "Recorded"
            }}</strong>
            by {{ item.actor.name }} · {{ item.updatedAt }}
            <span v-if="item.valuation" class="text-muted-foreground block">
              FX: {{ item.valuation.source }} ·
              {{ item.valuation.effectiveDate }}
            </span>
          </li>
        </ul>
      </Card>
    </template>
  </div>
</template>
