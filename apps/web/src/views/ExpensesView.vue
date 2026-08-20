<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type ExpenseListFilters } from "@/lib/api/client";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import {
  parseExpenseQuery,
  serializeExpenseQuery,
} from "@/features/expenses/expense-query";

const route = useRoute();
const router = useRouter();
const { formatCurrency } = useCurrencyFormatter();
const routeFilters = computed(() => parseExpenseQuery(route.query));
const form = reactive<ExpenseListFilters>({ ...routeFilters.value });
watch(routeFilters, (value) =>
  Object.assign(form, {
    q: undefined,
    categoryId: undefined,
    personId: undefined,
    groupId: undefined,
    friendshipId: undefined,
    currency: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    settledState: undefined,
    status: undefined,
    sort: undefined,
    cursor: undefined,
    ...value,
  }),
);
const categories = useQuery({
  queryKey: ["categories", "active"],
  queryFn: () => api.categories(),
});
const preferences = useQuery({
  queryKey: ["profile", "options"],
  queryFn: api.profileOptions,
});
const groups = useQuery({
  queryKey: ["groups", "expense-filter"],
  queryFn: () => api.groups("ACTIVE"),
});
const friends = useQuery({
  queryKey: ["friends", "expense-filter"],
  queryFn: () => api.friends(),
});
const expenses = useQuery(
  computed(() => ({
    queryKey: ["expenses", "browser", routeFilters.value],
    queryFn: () => api.expenses(routeFilters.value),
  })),
);
const search = useQuery(
  computed(() => ({
    queryKey: ["search", form.q],
    queryFn: () => api.search(form.q!),
    enabled: Boolean(form.q && form.q.length >= 2),
  })),
);
const activeFilters = computed(() =>
  Object.entries(routeFilters.value).filter(
    ([key, value]) => key !== "cursor" && Boolean(value),
  ),
);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => form.q,
  (value) => {
    if ((route.query.q ?? "") === (value ?? "")) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const next = { ...routeFilters.value };
      delete next.cursor;
      if (value) next.q = value;
      else delete next.q;
      void router.replace({ query: serializeExpenseQuery(next) });
    }, 300);
  },
);
watch(
  () => form.groupId,
  (value) => {
    if (value) delete form.friendshipId;
  },
);
watch(
  () => form.friendshipId,
  (value) => {
    if (value) delete form.groupId;
  },
);
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

function apply(): void {
  const next = { ...form };
  delete next.cursor;
  void router.push({ query: serializeExpenseQuery(next) });
}
function clearAll(): void {
  Object.keys(form).forEach(
    (key) => delete form[key as keyof ExpenseListFilters],
  );
  void router.push({ query: {} });
}
function next(): void {
  if (expenses.data.value?.nextCursor)
    void router.push({
      query: serializeExpenseQuery({
        ...routeFilters.value,
        cursor: expenses.data.value.nextCursor,
      }),
    });
}
function removeFilter(key: string): void {
  delete (form as Record<string, unknown>)[key];
  apply();
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="section-kicker">Find and explain</p>
        <h1 class="text-2xl font-bold">Expenses</h1>
      </div>
      <Button as-child
        ><RouterLink to="/expenses/new">Add expense</RouterLink></Button
      >
    </div>
    <Card class="p-4 sm:p-5">
      <form class="grid gap-3 md:grid-cols-4" @submit.prevent="apply">
        <label class="md:col-span-2"
          >Search<input
            v-model="form.q"
            placeholder="Description, group, or person"
        /></label>
        <label
          >Category<select v-model="form.categoryId">
            <option value="">All categories</option>
            <option
              v-for="item in categories.data.value?.items"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select></label
        >
        <label
          >Currency<select v-model="form.currency">
            <option value="">All currencies</option>
            <option
              v-for="item in preferences.data.value?.currencies"
              :key="item.code"
              :value="item.code"
            >
              {{ item.code }}
            </option>
          </select></label
        >
        <label
          >Group<select v-model="form.groupId">
            <option value="">All groups</option>
            <option
              v-for="item in groups.data.value?.items"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }}
            </option>
          </select></label
        >
        <label
          >Friend context<select v-model="form.friendshipId">
            <option value="">All friends</option>
            <option
              v-for="item in friends.data.value?.items"
              :key="item.friendshipId"
              :value="item.friendshipId"
            >
              {{ item.user.name }}
            </option>
          </select></label
        >
        <label
          >Person involved<select v-model="form.personId">
            <option value="">Anyone</option>
            <option
              v-for="item in friends.data.value?.items"
              :key="item.user.id"
              :value="item.user.id"
            >
              {{ item.user.name }}
            </option>
          </select></label
        >
        <label
          >Record state<select v-model="form.status">
            <option value="">Active</option>
            <option value="ACTIVE">Active</option>
            <option value="DELETED">Deleted</option>
          </select></label
        >
        <label>From<input v-model="form.dateFrom" type="date" /></label>
        <label>To<input v-model="form.dateTo" type="date" /></label>
        <label
          >Settlement<select v-model="form.settledState">
            <option value="">All states</option>
            <option value="OPEN">Open</option>
            <option value="PARTIALLY_SETTLED">Partially settled</option>
            <option value="SETTLED">Settled</option>
          </select></label
        >
        <label
          >Sort<select v-model="form.sort">
            <option value="UPDATED_DESC">Recently updated</option>
            <option value="DATE_DESC">Newest date</option>
            <option value="DATE_ASC">Oldest date</option>
            <option value="AMOUNT_DESC" :disabled="!form.currency">
              Highest amount
            </option>
            <option value="AMOUNT_ASC" :disabled="!form.currency">
              Lowest amount
            </option>
          </select></label
        >
        <div class="flex gap-2 md:col-span-4">
          <Button type="submit">Apply filters</Button
          ><Button type="button" variant="outline" @click="clearAll"
            >Clear all</Button
          >
        </div>
      </form>
      <div
        v-if="activeFilters.length"
        class="mt-3 flex flex-wrap gap-2"
        aria-label="Active filters"
      >
        <button
          v-for="[key, value] in activeFilters"
          :key="key"
          type="button"
          class="status-badge"
          :aria-label="`Remove ${key} filter`"
          @click="removeFilter(key)"
        >
          {{ key }}: {{ value }} ×
        </button>
      </div>
    </Card>
    <Card
      v-if="
        form.q &&
        search.data.value &&
        (search.data.value.groups.length || search.data.value.people.length)
      "
      class="p-4"
      aria-label="Related search results"
    >
      <h2 class="font-bold">Groups and people</h2>
      <div class="mt-2 flex flex-wrap gap-2">
        <RouterLink
          v-for="group in search.data.value.groups"
          :key="group.id"
          class="status-badge"
          :to="`/groups/${group.id}`"
          >{{ group.name }}</RouterLink
        ><span
          v-for="person in search.data.value.people"
          :key="person.id"
          class="status-badge"
          >{{ person.name }}</span
        >
      </div>
    </Card>
    <p
      v-if="expenses.isPending.value"
      role="status"
      class="text-muted-foreground py-10"
    >
      Loading expenses…
    </p>
    <Card v-else-if="expenses.isError.value" class="p-5"
      ><p role="alert" class="form-error">
        Expenses could not be loaded.
      </p></Card
    >
    <Card v-else-if="!expenses.data.value?.items.length" class="p-8 text-center"
      ><h2 class="font-bold">No matching expenses</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        Clear filters or add a new expense.
      </p></Card
    >
    <ul v-else class="grid gap-3" aria-label="Expense results">
      <li v-for="item in expenses.data.value.items" :key="item.id">
        <Card class="p-4"
          ><RouterLink
            :to="`/expenses/${item.id}`"
            class="flex items-start justify-between gap-3"
            ><span class="min-w-0"
              ><strong class="block truncate">{{ item.description }}</strong
              ><span class="text-muted-foreground text-sm"
                >{{ item.expenseDate
                }}<template v-if="item.category">
                  · {{ item.category.name }}</template
                >
                ·
                {{
                  item.settlement.state.toLowerCase().replace("_", " ")
                }}</span
              ></span
            ><strong class="tabular-nums">{{
              formatCurrency(item.totalMinor, item.currency)
            }}</strong></RouterLink
          ></Card
        >
      </li>
    </ul>
    <div v-if="expenses.data.value?.nextCursor" class="flex justify-center">
      <Button variant="outline" @click="next">Next page</Button>
    </div>
  </div>
</template>
