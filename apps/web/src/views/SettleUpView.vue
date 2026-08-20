<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createIdempotencyKeyTracker } from "@/features/expenses/idempotency";
import {
  currencyMinorUnit,
  decimalToMinor,
  minorToDecimal,
} from "@/features/expenses/money";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import {
  api,
  ApiError,
  type SettlementMethod,
  type SettlementWriteInput,
} from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";

interface SuggestedTransfer {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  currency: string;
  amountMinor: string;
}

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { formatCurrency } = useCurrencyFormatter();
const session = useQuery(sessionQueryOptions);
const preferences = useQuery({
  queryKey: ["profile", "options"],
  queryFn: api.profileOptions,
});
const contexts = useQuery({
  queryKey: ["balances", "overall"],
  queryFn: () => api.balances(),
});
const correctionId = computed(() =>
  typeof route.params.settlementId === "string"
    ? route.params.settlementId
    : undefined,
);
const original = useQuery(
  computed(() => ({
    queryKey: ["settlements", "detail", correctionId.value],
    queryFn: () => api.settlement(correctionId.value!),
    enabled: Boolean(correctionId.value),
  })),
);
const context = ref("");
const form = reactive({
  transfer: "",
  amount: "",
  method: "CASH" as SettlementMethod,
  methodLabel: "",
  settledOn: new Date().toLocaleDateString("en-CA"),
  note: "",
  reason: "",
});
const reviewed = ref(false);
const localError = ref("");
const errorSummary = ref<HTMLElement>();
const idempotency = createIdempotencyKeyTracker();

watch(
  [contexts.data, original.data],
  () => {
    if (context.value) return;
    const requestedGroup =
      typeof route.query.groupId === "string" ? route.query.groupId : undefined;
    const requestedFriend =
      typeof route.query.friendshipId === "string"
        ? route.query.friendshipId
        : undefined;
    const source = original.data.value;
    context.value = source?.groupId
      ? `GROUP:${source.groupId}`
      : source?.friendshipId
        ? `FRIENDSHIP:${source.friendshipId}`
        : requestedGroup
          ? `GROUP:${requestedGroup}`
          : requestedFriend
            ? `FRIENDSHIP:${requestedFriend}`
            : "";
    if (source) {
      form.method = source.method;
      form.methodLabel = source.methodLabel ?? "";
      form.settledOn = source.settledOn;
      form.note = source.note ?? "";
    }
  },
  { immediate: true },
);
const contextType = computed(() => context.value.split(":", 1)[0]);
const contextId = computed(() =>
  context.value.slice(context.value.indexOf(":") + 1),
);
const groupBalances = useQuery(
  computed(() => ({
    queryKey: ["balances", "groups", contextId.value],
    queryFn: () => api.groupBalances(contextId.value),
    enabled: contextType.value === "GROUP" && Boolean(contextId.value),
  })),
);
const friendBalances = useQuery(
  computed(() => ({
    queryKey: ["balances", "friends", contextId.value],
    queryFn: () => api.friendBalances(contextId.value),
    enabled: contextType.value === "FRIENDSHIP" && Boolean(contextId.value),
  })),
);
const suggestions = computed<SuggestedTransfer[]>(() => {
  const current = session.data.value?.user;
  if (!current) return [];
  let items: SuggestedTransfer[] = [];
  if (contextType.value === "FRIENDSHIP" && friendBalances.data.value) {
    const friend = friendBalances.data.value.friend;
    items = friendBalances.data.value.amounts.flatMap((amount) => {
      if (BigInt(amount.youOweMinor) > 0n)
        return [
          {
            fromUserId: current.id,
            fromName: current.name,
            toUserId: friend.id,
            toName: friend.name,
            currency: amount.currency,
            amountMinor: amount.youOweMinor,
          },
        ];
      if (BigInt(amount.youAreOwedMinor) > 0n)
        return [
          {
            fromUserId: friend.id,
            fromName: friend.name,
            toUserId: current.id,
            toName: current.name,
            currency: amount.currency,
            amountMinor: amount.youAreOwedMinor,
          },
        ];
      return [];
    });
  } else {
    const group = groupBalances.data.value;
    const transfers = group
      ? group.simplifyDebtsEnabled
        ? group.recommendations
        : group.rawObligations
      : [];
    items = transfers
      .filter(
        (item) => item.from.id === current.id || item.to.id === current.id,
      )
      .map((item) => ({
        fromUserId: item.from.id,
        fromName: item.from.name,
        toUserId: item.to.id,
        toName: item.to.name,
        currency: item.currency,
        amountMinor: item.amountMinor,
      }));
  }
  const source = original.data.value;
  if (!source) return items;
  const remaining = items.find(
    (item) =>
      item.fromUserId === source.from.id &&
      item.toUserId === source.to.id &&
      item.currency === source.currency,
  );
  return [
    {
      fromUserId: source.from.id,
      fromName: source.from.name,
      toUserId: source.to.id,
      toName: source.to.name,
      currency: source.currency,
      amountMinor: (
        BigInt(source.amountMinor) + BigInt(remaining?.amountMinor ?? "0")
      ).toString(),
    },
  ];
});
const selected = computed(() => suggestions.value[Number(form.transfer)]);
const minorUnit = computed(() => {
  const currency =
    selected.value?.currency ?? original.data.value?.currency ?? "USD";
  return currencyMinorUnit(
    currency,
    preferences.data.value?.currencies.find((item) => item.code === currency)
      ?.minorUnit,
  );
});
watch(
  suggestions,
  (items) => {
    if (!items.length) return;
    let index = 0;
    const source = original.data.value;
    if (source) {
      const match = items.findIndex(
        (item) =>
          item.fromUserId === source.from.id &&
          item.toUserId === source.to.id &&
          item.currency === source.currency,
      );
      if (match >= 0) index = match;
    }
    form.transfer = String(index);
    form.amount = source
      ? minorToDecimal(source.amountMinor, minorUnit.value)
      : minorToDecimal(items[index]!.amountMinor, minorUnit.value);
  },
  { immediate: true },
);
watch(
  () => [
    context.value,
    form.transfer,
    form.amount,
    form.method,
    form.methodLabel,
    form.settledOn,
    form.note,
    form.reason,
  ],
  () => (reviewed.value = false),
);

function buildInput(): SettlementWriteInput | undefined {
  localError.value = "";
  const transfer = selected.value;
  const amountMinor = decimalToMinor(form.amount, minorUnit.value);
  if (!context.value) localError.value = "Choose a friend or group.";
  else if (!transfer) localError.value = "Choose an outstanding balance.";
  else if (!amountMinor || BigInt(amountMinor) <= 0n)
    localError.value = "Enter a positive amount using the currency precision.";
  else if (BigInt(amountMinor) > BigInt(transfer.amountMinor))
    localError.value = "The payment cannot exceed the outstanding amount.";
  else if (form.method === "OTHER" && !form.methodLabel.trim())
    localError.value = "Describe the payment method.";
  else if (correctionId.value && !form.reason.trim())
    localError.value = "Explain why this payment is being corrected.";
  if (localError.value || !transfer || !amountMinor) return undefined;
  return {
    ...(contextType.value === "GROUP" ? { groupId: contextId.value } : {}),
    fromUserId: transfer.fromUserId,
    toUserId: transfer.toUserId,
    amountMinor,
    currency: transfer.currency,
    method: form.method,
    ...(form.methodLabel.trim()
      ? { methodLabel: form.methodLabel.trim() }
      : {}),
    settledOn: form.settledOn,
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
}
const save = useMutation({
  mutationFn: async () => {
    const input = buildInput();
    if (!input) throw new Error(localError.value);
    return correctionId.value
      ? api.correctSettlement(
          correctionId.value,
          original.data.value!.version,
          form.reason,
          input,
          idempotency.forInput({ ...input, reason: form.reason }),
        )
      : api.createSettlement(input, idempotency.forInput(input));
  },
  onSuccess: async (settlement) => {
    idempotency.reset();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["balances"] }),
      queryClient.invalidateQueries({ queryKey: ["settlements"] }),
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
    ]);
    await router.push(`/settlements/${settlement.id}`);
  },
  onError: (error) => {
    localError.value =
      error instanceof ApiError
        ? error.message
        : localError.value || "The payment could not be recorded.";
    void nextTick(() => errorSummary.value?.focus());
  },
});
function review(): void {
  if (buildInput()) reviewed.value = true;
  else void nextTick(() => errorSummary.value?.focus());
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <div>
      <p class="section-kicker">Payment record</p>
      <h1 class="text-2xl font-bold">
        {{ correctionId ? "Correct payment" : "Settle up" }}
      </h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Record a full or partial payment. Opening another payment app never
        marks a balance paid.
      </p>
    </div>
    <Card v-if="original.isPending.value && correctionId" class="p-5"
      ><p role="status">Loading payment…</p></Card
    >
    <form
      v-else
      class="space-y-4"
      @submit.prevent="reviewed ? save.mutate() : review()"
    >
      <Card class="form-grid p-5 sm:p-6">
        <div>
          <p class="section-kicker">Step 1</p>
          <h2 class="text-lg font-bold">Payment details</h2>
        </div>
        <label
          >Friend or group<select
            v-model="context"
            required
            :disabled="Boolean(correctionId)"
          >
            <option value="" disabled>Choose a context</option>
            <option
              v-for="item in contexts.data.value?.contexts ?? []"
              :key="`${item.contextType}:${item.contextId}`"
              :value="`${item.contextType}:${item.contextId}`"
            >
              {{ item.name }}
            </option>
          </select></label
        >
        <label
          >Direction and currency<select v-model="form.transfer" required>
            <option value="" disabled>Choose a balance</option>
            <option
              v-for="(item, index) in suggestions"
              :key="`${item.fromUserId}:${item.toUserId}:${item.currency}`"
              :value="String(index)"
            >
              {{ item.fromName }} pays {{ item.toName }} ·
              {{ formatCurrency(item.amountMinor, item.currency) }}
            </option>
          </select></label
        >
        <p
          v-if="context && !suggestions.length"
          class="text-muted-foreground text-sm"
        >
          There is no outstanding balance involving you in this context.
        </p>
        <div class="grid gap-4 sm:grid-cols-3">
          <label
            >Amount<input v-model="form.amount" required inputmode="decimal"
          /></label>
          <label
            >Method<select v-model="form.method">
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select></label
          >
          <label
            >Date<input v-model="form.settledOn" required type="date"
          /></label>
        </div>
        <label v-if="form.method === 'OTHER'"
          >Method description<input
            v-model="form.methodLabel"
            maxlength="80"
            required
        /></label>
        <label
          >Note (optional)<textarea
            v-model="form.note"
            maxlength="2000"
            rows="3"
          />
        </label>
        <label v-if="correctionId"
          >Correction reason<textarea
            v-model="form.reason"
            maxlength="500"
            rows="2"
            required
          />
        </label>
      </Card>
      <Card
        v-if="reviewed && selected"
        class="p-5 sm:p-6"
        aria-labelledby="payment-review-heading"
        ><p class="section-kicker">Step 2</p>
        <h2 id="payment-review-heading" class="text-lg font-bold">
          Confirm payment
        </h2>
        <dl class="mt-4 space-y-2 text-sm">
          <div class="flex justify-between gap-3">
            <dt>Direction</dt>
            <dd class="font-semibold">
              {{ selected.fromName }} pays {{ selected.toName }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>Amount</dt>
            <dd class="tabular-nums font-semibold">
              {{
                formatCurrency(
                  decimalToMinor(form.amount, minorUnit) ?? "0",
                  selected.currency,
                )
              }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>Method</dt>
            <dd>
              {{
                form.methodLabel ||
                form.method.replaceAll("_", " ").toLowerCase()
              }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>Date</dt>
            <dd>{{ form.settledOn }}</dd>
          </div>
        </dl></Card
      >
      <p
        v-if="localError"
        ref="errorSummary"
        class="form-error"
        role="alert"
        tabindex="-1"
      >
        {{ localError }}
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          v-if="reviewed"
          type="button"
          variant="outline"
          @click="reviewed = false"
          >Edit details</Button
        ><Button :disabled="save.isPending.value || !suggestions.length">{{
          save.isPending.value
            ? "Saving…"
            : reviewed
              ? correctionId
                ? "Confirm correction"
                : "Confirm payment"
              : "Review payment"
        }}</Button>
      </div>
    </form>
  </div>
</template>
