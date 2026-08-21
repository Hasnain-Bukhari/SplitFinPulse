<script setup lang="ts">
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/vue-query";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  api,
  ApiError,
  type ExpensePreview,
  type ExpenseSplitMethod,
  type ExpenseWriteInput,
  type FriendshipSummary,
  type GroupSummary,
  type GroupMemberPage,
  type ExpenseAttachment,
  type AttachmentExtraction,
  type Valuation,
} from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";
import {
  addMinor,
  currencyMinorUnit,
  decimalToMinor,
  expenseCurrencyDefault,
  formatMinor,
} from "./money";
import { expenseDraftFingerprint } from "./idempotency";
import { useCurrencyFormatter } from "./useCurrencyFormatter";

const props = withDefaults(
  defineProps<{
    initial?: ExpenseWriteInput | undefined;
    groups?: GroupSummary[];
    friends?: FriendshipSummary[];
    currencies?:
      Array<{ code: string; name: string; minorUnit: number }> | undefined;
    pending?: boolean;
    error?: string;
    submitLabel?: string;
    lockContext?: boolean;
    peopleOverride?: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
    }>;
    recurring?: boolean;
  }>(),
  {
    groups: () => [],
    friends: () => [],
    currencies: () => [],
    pending: false,
    error: "",
    submitLabel: "Create expense",
    lockContext: false,
    peopleOverride: () => [],
    recurring: false,
  },
);

const emit = defineEmits<{ submit: [input: ExpenseWriteInput] }>();
const { formatCurrency } = useCurrencyFormatter();
const session = useQuery(sessionQueryOptions);
const context = ref(
  props.initial?.groupId
    ? `group:${props.initial.groupId}`
    : props.initial?.friendshipId
      ? `friend:${props.initial.friendshipId}`
      : "",
);
const form = reactive({
  description: props.initial?.description ?? "",
  amount: "",
  currency:
    props.initial?.currency ??
    session.data.value?.user.defaultCurrency ??
    "USD",
  expenseDate:
    props.initial?.expenseDate ?? new Date().toLocaleDateString("en-CA"),
  notes: props.initial?.notes ?? "",
  splitMethod: props.initial?.splitMethod ?? ("EQUAL" as ExpenseSplitMethod),
  categoryId: props.initial?.categoryId ?? "",
});
const payerAmounts = reactive<Record<string, string>>({});
const participantInputs = reactive<Record<string, string>>({});
const selectedPayers = ref<string[]>([]);
const selectedParticipants = ref<string[]>([]);
const previewResult = ref<ExpensePreview>();
const previewFingerprint = ref("");
const localError = ref("");
const currencyOverridden = ref(false);
const categories = useQuery({
  queryKey: ["categories", "active"],
  queryFn: () => api.categories(),
});
const uploadedAttachments = ref<ExpenseAttachment[]>([]);
const attachmentPreviewUrls = reactive<Record<string, string>>({});
const attachmentIds = ref<string[]>(props.initial?.attachmentIds ?? []);
const attachmentError = ref("");
const uploadProgress = ref<number>();
const valuation = ref<Valuation>();
const manualRate = ref("");
const valuationNotice = ref("");
const reportingPreview = computed(() =>
  valuation.value?.convertedPreviews?.find(
    (item) => item.currency === session.data.value?.user.defaultCurrency,
  ),
);
const reportingQuote = computed(() =>
  valuation.value?.quotes.find(
    (item) => item.quoteCurrency === session.data.value?.user.defaultCurrency,
  ),
);

const selectedGroupId = computed(() =>
  context.value.startsWith("group:") ? context.value.slice(6) : undefined,
);
const selectedFriendship = computed(() =>
  props.friends.find((item) => `friend:${item.friendshipId}` === context.value),
);
const groupMembers = useInfiniteQuery(
  computed(() => ({
    queryKey: ["groups", "expense-context", selectedGroupId.value, "members"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.groupMembers(selectedGroupId.value!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: GroupMemberPage) => page.nextCursor ?? undefined,
    enabled: Boolean(selectedGroupId.value),
  })),
);
const people = computed(() => {
  if (props.peopleOverride.length) return props.peopleOverride;
  if (selectedGroupId.value) {
    return (groupMembers.data.value?.pages.flatMap((page) => page.items) ?? [])
      .filter((member) => !member.leftAt)
      .map((member) => member.user);
  }
  const friend = selectedFriendship.value?.user;
  const current = session.data.value?.user;
  return [current, friend].filter(
    (
      person,
    ): person is { id: string; name: string; avatarUrl: string | null } =>
      Boolean(person),
  );
});
const minorUnit = computed(() =>
  currencyMinorUnit(
    form.currency,
    props.currencies.find((item) => item.code === form.currency)?.minorUnit,
  ),
);
const splitInputLabel = computed(() => {
  if (form.splitMethod === "EXACT") return `Amount (${form.currency})`;
  if (form.splitMethod === "PERCENTAGE") return "Percentage";
  if (form.splitMethod === "SHARES") return "Shares";
  return "";
});

function initializeAllocations(): void {
  const ids = people.value.map((person) => person.id);
  selectedParticipants.value = props.initial?.participants.length
    ? props.initial.participants.map((item) => item.userId)
    : ids;
  selectedPayers.value =
    (props.initial?.payers.length
      ? props.initial.payers.map((item) => item.userId)
      : undefined) ??
    (session.data.value?.user.id
      ? [session.data.value.user.id]
      : ids.slice(0, 1));
  for (const payer of props.initial?.payers ?? []) {
    payerAmounts[payer.userId] = formatInput(payer.amountMinor);
  }
  for (const participant of props.initial?.participants ?? []) {
    if (participant.input)
      participantInputs[participant.userId] =
        form.splitMethod === "EXACT"
          ? formatInput(participant.input)
          : participant.input;
  }
  if (
    selectedPayers.value.length === 1 &&
    !payerAmounts[selectedPayers.value[0]!]
  ) {
    payerAmounts[selectedPayers.value[0]!] = form.amount;
  }
}

function formatInput(minor: string): string {
  const negative = minor.startsWith("-");
  const digits = negative ? minor.slice(1) : minor;
  if (!minorUnit.value) return minor;
  const padded = digits.padStart(minorUnit.value + 1, "0");
  const result = `${padded.slice(0, -minorUnit.value)}.${padded.slice(-minorUnit.value)}`;
  return negative ? `-${result}` : result;
}

watch(
  people,
  (next, previous) => {
    if (!next.length) return;
    if (previous?.length) {
      if (!props.lockContext) {
        const additions = next
          .map((person) => person.id)
          .filter((id) => !previous.some((person) => person.id === id));
        selectedParticipants.value.push(...additions);
      }
      return;
    }
    initializeAllocations();
  },
  { immediate: true },
);
watch(
  () =>
    [
      groupMembers.hasNextPage.value,
      groupMembers.isFetchingNextPage.value,
    ] as const,
  ([hasNext, isFetching]) => {
    if (hasNext && !isFetching) void groupMembers.fetchNextPage();
  },
  { immediate: true },
);
watch(
  () => props.initial,
  (initial) => {
    if (!initial) return;
    form.currency = expenseCurrencyDefault(
      form.currency,
      initial.currency,
      currencyOverridden.value,
    );
    form.amount = formatInput(initial.totalMinor);
    initializeAllocations();
  },
  { immediate: true },
);
watch(
  () => form.amount,
  (amount) => {
    if (selectedPayers.value.length === 1)
      payerAmounts[selectedPayers.value[0]!] = amount;
    previewResult.value = undefined;
  },
);
watch(context, () => {
  selectedParticipants.value = [];
  selectedPayers.value = [];
  previewResult.value = undefined;
  void nextTick(initializeAllocations);
});
watch(
  () => [selectedGroupId.value, props.groups] as const,
  ([groupId]) => {
    if (!groupId) return;
    const selected = props.groups.find((item) => item.id === groupId);
    form.currency = expenseCurrencyDefault(
      form.currency,
      selected?.defaultCurrency,
      currencyOverridden.value,
    );
  },
  { immediate: true, deep: true },
);

function buildInput(): ExpenseWriteInput | null {
  localError.value = "";
  const totalMinor = decimalToMinor(form.amount, minorUnit.value);
  if (!context.value) localError.value = "Choose a friend or group.";
  else if (!form.description.trim()) localError.value = "Enter a description.";
  else if (!totalMinor || BigInt(totalMinor) <= 0n)
    localError.value = "Enter a positive amount using the currency precision.";
  else if (!selectedPayers.value.length)
    localError.value = "Select at least one payer.";
  else if (!selectedParticipants.value.length)
    localError.value = "Select at least one participant.";
  if (localError.value || !totalMinor) return null;

  const payers = selectedPayers.value.map((userId) => ({
    userId,
    amountMinor:
      decimalToMinor(payerAmounts[userId] ?? "", minorUnit.value) ?? "-1",
  }));
  if (payers.some((payer) => BigInt(payer.amountMinor) <= 0n)) {
    localError.value = "Every selected payer needs a positive amount.";
    return null;
  }
  if (addMinor(payers.map((payer) => payer.amountMinor)) !== totalMinor) {
    localError.value = "Payer amounts must add up to the expense total.";
    return null;
  }
  const participants = selectedParticipants.value.map((userId) => ({
    userId,
    ...(form.splitMethod === "EQUAL"
      ? {}
      : {
          input:
            form.splitMethod === "EXACT"
              ? (decimalToMinor(
                  participantInputs[userId] ?? "",
                  minorUnit.value,
                ) ?? "")
              : (participantInputs[userId] ?? "").trim(),
        }),
  }));
  if (
    form.splitMethod !== "EQUAL" &&
    participants.some((item) => !item.input)
  ) {
    localError.value = `Enter ${splitInputLabel.value.toLowerCase()} for every participant.`;
    return null;
  }
  return {
    ...(selectedGroupId.value ? { groupId: selectedGroupId.value } : {}),
    ...(context.value.startsWith("friend:")
      ? { friendshipId: context.value.slice(7) }
      : {}),
    description: form.description.trim(),
    totalMinor,
    currency: form.currency,
    expenseDate: form.expenseDate,
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    payers,
    splitMethod: form.splitMethod,
    participants,
    ...(form.categoryId ? { categoryId: form.categoryId } : {}),
    ...(!props.recurring && attachmentIds.value.length
      ? { attachmentIds: attachmentIds.value }
      : {}),
    ...(!props.recurring && valuation.value
      ? { valuationId: valuation.value.valuationId }
      : {}),
  };
}

const preview = useMutation({
  mutationFn: async () => {
    let input = buildInput();
    if (!input) throw new Error(localError.value);
    if (!props.recurring) {
      valuationNotice.value = "";
      try {
        valuation.value = await api.valuation({
          baseCurrency: input.currency,
          effectiveDate: input.expenseDate,
          amountMinor: input.totalMinor,
        });
      } catch {
        valuation.value = undefined;
        valuationNotice.value =
          "Conversion is unavailable; this expense will remain usable in its native currency.";
      }
    }
    input = buildInput();
    if (!input) throw new Error(localError.value);
    return { input, result: await api.previewExpense(input) };
  },
  onSuccess: ({ input, result }) => {
    previewResult.value = result;
    previewFingerprint.value = expenseDraftFingerprint(input);
  },
  onError: (error) => {
    if (error instanceof ApiError) localError.value = error.message;
  },
});

async function previewWithManualRate(): Promise<void> {
  localError.value = "";
  const input = buildInput();
  const quoteCurrency = session.data.value?.user.defaultCurrency;
  if (!input || !quoteCurrency) {
    localError.value ||= "Choose an expense and reporting currency first.";
    return;
  }
  if (
    !/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]{1,18})?)$/.test(
      manualRate.value,
    )
  ) {
    localError.value =
      "Enter a positive rate with no more than 18 decimal places.";
    return;
  }
  try {
    valuation.value = await api.valuation({
      baseCurrency: input.currency,
      effectiveDate: input.expenseDate,
      amountMinor: input.totalMinor,
      quoteCurrencies: [quoteCurrency],
      manualRates: [
        {
          quoteCurrency,
          rateDecimal: manualRate.value,
          sourceLabel: "User supplied",
        },
      ],
    });
    const valuedInput = buildInput();
    if (!valuedInput) return;
    previewResult.value = await api.previewExpense(valuedInput);
    previewFingerprint.value = expenseDraftFingerprint(valuedInput);
  } catch (error) {
    localError.value =
      error instanceof ApiError
        ? error.message
        : "The manual conversion rate could not be prepared.";
  }
}

async function uploadReceipt(event: Event): Promise<void> {
  attachmentError.value = "";
  uploadProgress.value = 0;
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const previewUrl = URL.createObjectURL(file);
  try {
    const intent = await api.createUploadIntent({
      originalName: file.name,
      declaredMime: file.type,
    });
    const uploaded = await api.uploadAttachment(intent, file, (percent) => {
      uploadProgress.value = percent;
    });
    uploadedAttachments.value.push(uploaded);
    attachmentIds.value.push(uploaded.id);
    attachmentPreviewUrls[uploaded.id] = previewUrl;
    void pollExtraction(uploaded.id);
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    attachmentError.value =
      error instanceof ApiError
        ? error.message
        : "The receipt could not be uploaded.";
  } finally {
    uploadProgress.value = undefined;
    target.value = "";
  }
}

async function removeDraftAttachment(id: string): Promise<void> {
  try {
    await api.deleteAttachment(id);
    uploadedAttachments.value = uploadedAttachments.value.filter(
      (item) => item.id !== id,
    );
    attachmentIds.value = attachmentIds.value.filter((item) => item !== id);
    const previewUrl = attachmentPreviewUrls[id];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    delete attachmentPreviewUrls[id];
  } catch (error) {
    attachmentError.value =
      error instanceof ApiError
        ? error.message
        : "The receipt could not be removed.";
  }
}

onBeforeUnmount(() => {
  Object.values(attachmentPreviewUrls).forEach((url) =>
    URL.revokeObjectURL(url),
  );
});

async function pollExtraction(id: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await api.attachmentExtraction(id);
    const item = uploadedAttachments.value.find((row) => row.id === id);
    if (item) item.extraction = result;
    if (!["PENDING", "RUNNING"].includes(result.status)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
}

function applySuggestion(
  result: AttachmentExtraction,
  field: "merchant" | "expenseDate" | "totalText" | "currencyHint",
): void {
  if (field === "merchant" && result.merchant)
    form.description = result.merchant;
  if (field === "expenseDate" && result.expenseDate)
    form.expenseDate = result.expenseDate;
  if (field === "totalText" && result.totalText) form.amount = result.totalText;
  if (field === "currencyHint" && result.currencyHint) {
    form.currency = result.currencyHint;
    currencyOverridden.value = true;
  }
  previewResult.value = undefined;
}

function submit(): void {
  const input = buildInput();
  if (!input) return;
  if (
    !previewResult.value ||
    previewFingerprint.value !== expenseDraftFingerprint(input)
  ) {
    previewResult.value = undefined;
    localError.value =
      "The expense changed after preview. Preview it again before confirming.";
    return;
  }
  emit("submit", input);
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <Card class="form-grid p-5 sm:p-6">
      <div>
        <p class="section-kicker">Step 1</p>
        <h2 class="text-lg font-bold">Expense context</h2>
      </div>
      <label>
        Friend or group
        <select v-model="context" required :disabled="lockContext">
          <option value="" disabled>Choose a context</option>
          <option
            v-if="lockContext && initial?.groupId"
            :value="`group:${initial.groupId}`"
          >
            Current group
          </option>
          <option
            v-if="lockContext && initial?.friendshipId"
            :value="`friend:${initial.friendshipId}`"
          >
            Current friend
          </option>
          <optgroup label="Groups">
            <option
              v-for="item in groups"
              :key="item.id"
              :value="`group:${item.id}`"
              :disabled="item.status !== 'ACTIVE'"
            >
              {{ item.name }}
            </option>
          </optgroup>
          <optgroup label="Friends">
            <option
              v-for="item in friends"
              :key="item.friendshipId"
              :value="`friend:${item.friendshipId}`"
            >
              {{ item.user.name }}
            </option>
          </optgroup>
        </select>
      </label>
    </Card>

    <Card class="form-grid p-5 sm:p-6">
      <div>
        <p class="section-kicker">Step 2</p>
        <h2 class="text-lg font-bold">Details</h2>
      </div>
      <label
        >Description<input
          v-model="form.description"
          maxlength="140"
          required
          placeholder="Dinner"
      /></label>
      <div class="grid gap-4 sm:grid-cols-3">
        <label
          >Amount<input
            v-model="form.amount"
            required
            inputmode="decimal"
            placeholder="0.00"
        /></label>
        <label
          >Currency<select
            v-model="form.currency"
            @change="currencyOverridden = true"
          >
            <option
              v-for="item in currencies.length
                ? currencies
                : [{ code: form.currency, name: form.currency }]"
              :key="item.code"
              :value="item.code"
            >
              {{ item.code }}
            </option>
          </select></label
        >
        <label
          >Date<input v-model="form.expenseDate" required type="date"
        /></label>
      </div>
      <label
        >Notes (optional)<textarea
          v-model="form.notes"
          maxlength="1000"
          rows="3"
        />
      </label>
      <label
        >Category (optional)<select v-model="form.categoryId">
          <option value="">Uncategorized</option>
          <option
            v-for="item in categories.data.value?.items"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option>
        </select></label
      >
    </Card>

    <Card v-if="!recurring" class="p-5 sm:p-6">
      <p class="section-kicker">Receipt</p>
      <h2 class="text-lg font-bold">Attach a receipt</h2>
      <label class="mt-3 block">
        <span class="sr-only">Choose receipt image or PDF</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          @change="uploadReceipt"
        />
      </label>
      <p v-if="attachmentError" class="form-error mt-2" role="alert">
        {{ attachmentError }}
      </p>
      <p
        v-if="uploadProgress !== undefined"
        class="text-muted-foreground mt-2 text-sm"
        role="status"
        aria-live="polite"
      >
        Uploading receipt… {{ uploadProgress }}%
      </p>
      <ul v-if="uploadedAttachments.length" class="mt-3 space-y-3">
        <li
          v-for="item in uploadedAttachments"
          :key="item.id"
          class="rounded-lg border p-3 text-sm"
        >
          <strong>{{ item.originalName }}</strong>
          <span class="text-muted-foreground ml-2">{{
            item.extraction?.status ?? "PENDING"
          }}</span>
          <img
            v-if="
              item.mime.startsWith('image/') && attachmentPreviewUrls[item.id]
            "
            :src="attachmentPreviewUrls[item.id]"
            :alt="`Preview of ${item.originalName}`"
            class="mt-2 max-h-48 rounded-md object-contain"
          />
          <object
            v-else-if="
              item.mime === 'application/pdf' && attachmentPreviewUrls[item.id]
            "
            :data="attachmentPreviewUrls[item.id]"
            type="application/pdf"
            class="mt-2 h-48 w-full rounded-md border"
          >
            PDF preview for {{ item.originalName }}
          </object>
          <div
            v-if="item.extraction?.status === 'SUCCEEDED'"
            class="mt-2 flex flex-wrap gap-2"
          >
            <Button
              v-if="item.extraction.merchant"
              type="button"
              size="sm"
              variant="outline"
              @click="applySuggestion(item.extraction, 'merchant')"
              >Use merchant: {{ item.extraction.merchant }}</Button
            >
            <Button
              v-if="item.extraction.expenseDate"
              type="button"
              size="sm"
              variant="outline"
              @click="applySuggestion(item.extraction, 'expenseDate')"
              >Use date: {{ item.extraction.expenseDate }}</Button
            >
            <Button
              v-if="item.extraction.totalText"
              type="button"
              size="sm"
              variant="outline"
              @click="applySuggestion(item.extraction, 'totalText')"
              >Use total: {{ item.extraction.totalText }}</Button
            >
            <Button
              v-if="item.extraction.currencyHint"
              type="button"
              size="sm"
              variant="outline"
              @click="applySuggestion(item.extraction, 'currencyHint')"
              >Use currency: {{ item.extraction.currencyHint }}</Button
            >
          </div>
          <p
            v-else-if="item.extraction?.status === 'FAILED'"
            class="form-error mt-2"
          >
            OCR failed; the receipt remains attached.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            class="mt-2"
            :aria-label="`Remove ${item.originalName}`"
            @click="removeDraftAttachment(item.id)"
          >
            Remove
          </Button>
        </li>
      </ul>
    </Card>

    <Card class="p-5 sm:p-6">
      <fieldset :disabled="!people.length" class="space-y-3">
        <legend>
          <span class="section-kicker">Step 3</span
          ><span class="block text-lg font-bold">Who paid?</span>
        </legend>
        <div
          v-for="person in people"
          :key="person.id"
          class="grid grid-cols-[1fr_minmax(8rem,0.45fr)] items-end gap-3"
        >
          <label class="check-row"
            ><input
              v-model="selectedPayers"
              type="checkbox"
              :value="person.id"
            /><span>{{ person.name }}</span></label
          >
          <label v-if="selectedPayers.includes(person.id)" class="text-xs"
            >Amount ({{ form.currency }})<input
              v-model="payerAmounts[person.id]"
              inputmode="decimal"
          /></label>
        </div>
      </fieldset>
    </Card>

    <Card class="p-5 sm:p-6">
      <fieldset :disabled="!people.length" class="space-y-4">
        <legend>
          <span class="section-kicker">Step 4</span
          ><span class="block text-lg font-bold">How is it split?</span>
        </legend>
        <label
          >Split method<select v-model="form.splitMethod">
            <option value="EQUAL">Equally</option>
            <option value="EXACT">Exact amounts</option>
            <option value="PERCENTAGE">Percentages</option>
            <option value="SHARES">Shares</option>
          </select></label
        >
        <div
          v-for="person in people"
          :key="person.id"
          class="grid grid-cols-[1fr_minmax(8rem,0.45fr)] items-end gap-3"
        >
          <label class="check-row"
            ><input
              v-model="selectedParticipants"
              type="checkbox"
              :value="person.id"
            /><span>{{ person.name }}</span></label
          >
          <label
            v-if="
              form.splitMethod !== 'EQUAL' &&
              selectedParticipants.includes(person.id)
            "
            class="text-xs"
            >{{ splitInputLabel
            }}<input v-model="participantInputs[person.id]" inputmode="decimal"
          /></label>
        </div>
      </fieldset>
    </Card>

    <Card class="p-5 sm:p-6">
      <p class="section-kicker">Step 5</p>
      <h2 class="text-lg font-bold">Review</h2>
      <div v-if="previewResult" class="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 class="text-sm font-bold">Owed amounts</h3>
          <ul class="mt-2 space-y-1 text-sm">
            <li
              v-for="item in previewResult.splits"
              :key="item.userId"
              class="flex justify-between gap-3"
            >
              <span>{{
                item.user?.name ??
                people.find((person) => person.id === item.userId)?.name ??
                "Participant"
              }}</span
              ><strong class="tabular-nums">{{
                formatMinor(item.owedMinor, previewResult.currency, minorUnit)
              }}</strong>
            </li>
          </ul>
        </div>
        <div>
          <h3 class="text-sm font-bold">Ledger effect</h3>
          <ul class="mt-2 space-y-1 text-sm">
            <li
              v-for="item in previewResult.ledgerEntries"
              :key="item.sequence"
            >
              {{
                item.debtor?.name ??
                people.find((person) => person.id === item.debtorId)?.name ??
                "Participant"
              }}
              owes
              {{
                item.creditor?.name ??
                people.find((person) => person.id === item.creditorId)?.name ??
                "participant"
              }}
              <strong class="tabular-nums">{{
                formatMinor(item.amountMinor, item.currency, minorUnit)
              }}</strong>
            </li>
          </ul>
        </div>
      </div>
      <p v-else class="text-muted-foreground mt-2 text-sm">
        Preview validates the split and shows exactly who owes whom.
      </p>
      <p v-if="localError || error" class="form-error mt-3" role="alert">
        {{ localError || error }}
      </p>
      <p
        v-if="!recurring && valuation"
        class="text-muted-foreground mt-3 text-xs"
      >
        Conversion snapshot: {{ valuation.source }} ·
        {{ valuation.effectiveDate }} ·
        {{
          valuation.status === "UNAVAILABLE"
            ? "converted summaries unavailable"
            : "rates captured for this revision"
        }}
      </p>
      <p v-if="!recurring && reportingPreview" class="mt-1 text-xs">
        Reporting preview:
        {{
          formatCurrency(
            reportingPreview.amountMinor,
            reportingPreview.currency,
          )
        }}
      </p>
      <p v-if="!recurring && reportingQuote" class="mt-1 text-xs">
        Exact rational rate: {{ reportingQuote.numerator }} /
        {{ reportingQuote.denominator }} {{ reportingQuote.quoteCurrency }}
      </p>
      <p
        v-if="!recurring && valuationNotice"
        class="text-muted-foreground mt-3 text-xs"
        role="status"
      >
        {{ valuationNotice }}
      </p>
      <div
        v-if="
          !recurring &&
          valuation?.status === 'UNAVAILABLE' &&
          session.data.value?.user.defaultCurrency !== form.currency
        "
        class="mt-3 rounded-lg border p-3"
      >
        <p class="text-sm font-semibold">Manual conversion fallback</p>
        <p class="text-muted-foreground mt-1 text-xs">
          1 {{ form.currency }} equals how many
          {{ session.data.value?.user.defaultCurrency }}?
        </p>
        <div class="mt-2 flex flex-wrap items-end gap-2">
          <label class="text-sm"
            >Rate<input v-model="manualRate" inputmode="decimal"
          /></label>
          <Button
            type="button"
            variant="outline"
            @click="previewWithManualRate"
          >
            Apply rate and re-preview
          </Button>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="preview.isPending.value"
          @click="preview.mutate()"
          >{{
            preview.isPending.value ? "Checking…" : "Preview expense"
          }}</Button
        >
        <Button type="submit" :disabled="pending || !previewResult">{{
          pending ? "Saving…" : submitLabel
        }}</Button>
      </div>
    </Card>
  </form>
</template>
