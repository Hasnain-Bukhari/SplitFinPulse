<script setup lang="ts">
import { computed, reactive } from "vue";
import { Button } from "@/components/ui/button";
import type { CreateGroupInput } from "@/lib/api/client";

const props = withDefaults(
  defineProps<{
    initial?: CreateGroupInput;
    submitLabel?: string;
    pending?: boolean;
    error?: string;
    currencies?: Array<{ code: string; name: string }>;
  }>(),
  {
    submitLabel: "Create group",
    pending: false,
    error: "",
    currencies: () => [],
  },
);

const emit = defineEmits<{ submit: [input: CreateGroupInput] }>();

const form = reactive<CreateGroupInput>({
  name: props.initial?.name ?? "",
  type: props.initial?.type ?? "OTHER",
  defaultCurrency: props.initial?.defaultCurrency ?? "USD",
  simplifyDebtsEnabled: props.initial?.simplifyDebtsEnabled ?? false,
});
const currencyOptions = computed(() =>
  props.currencies.length
    ? props.currencies
    : [{ code: form.defaultCurrency, name: form.defaultCurrency }],
);

function submit(): void {
  emit("submit", { ...form, name: form.name.trim() });
}
</script>

<template>
  <form class="form-grid" @submit.prevent="submit">
    <label>
      Group name
      <input
        v-model="form.name"
        required
        maxlength="100"
        autocomplete="off"
        placeholder="Summer trip"
      />
    </label>
    <div class="grid gap-4 sm:grid-cols-2">
      <label>
        Group type
        <select v-model="form.type">
          <option value="TRIP">Trip</option>
          <option value="HOME">Home</option>
          <option value="COUPLE">Couple</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label>
        Default currency
        <select v-model="form.defaultCurrency">
          <option
            v-for="currency in currencyOptions"
            :key="currency.code"
            :value="currency.code"
          >
            {{ currency.code }} — {{ currency.name }}
          </option>
        </select>
      </label>
    </div>
    <label class="check-row">
      <input v-model="form.simplifyDebtsEnabled" type="checkbox" />
      <span>
        Simplify debts when settlements become available
        <small class="text-muted-foreground block font-normal">
          This preference will apply without changing original expense history.
        </small>
      </span>
    </label>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="pending || !form.name.trim()">
        {{ pending ? "Saving…" : submitLabel }}
      </Button>
      <Button as-child variant="ghost">
        <RouterLink to="/groups">Cancel</RouterLink>
      </Button>
    </div>
  </form>
</template>
