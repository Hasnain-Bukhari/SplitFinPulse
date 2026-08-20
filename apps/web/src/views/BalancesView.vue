<script setup lang="ts">
import { useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BalanceAmounts from "@/features/balances/BalanceAmounts.vue";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import { api } from "@/lib/api/client";
import { sessionQueryOptions } from "@/lib/query-client";

const { formatCurrency } = useCurrencyFormatter();
const session = useQuery(sessionQueryOptions);
const currencies = useQuery({
  queryKey: ["profile", "options"],
  queryFn: () => api.profileOptions(),
});
const reportingCurrency = ref("");
watch(
  () => session.data.value?.user.defaultCurrency,
  (value) => {
    if (value && !reportingCurrency.value) reportingCurrency.value = value;
  },
  { immediate: true },
);
const balances = useInfiniteQuery(
  computed(() => ({
    queryKey: ["balances", "overall", reportingCurrency.value],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.balances(pageParam, reportingCurrency.value || undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: Awaited<ReturnType<typeof api.balances>>) =>
      page.nextCursor ?? undefined,
  })),
);
const totals = computed(() => balances.data.value?.pages[0]?.totals ?? []);
const contexts = computed(
  () => balances.data.value?.pages.flatMap((page) => page.contexts) ?? [],
);
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="section-kicker">Financial position</p>
        <h1 class="text-2xl font-bold">Balances</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          Currencies remain separate. Every amount can be traced to expenses and
          payments.
        </p>
      </div>
      <Button v-if="contexts.length" as-child
        ><RouterLink to="/settlements/new">Settle up</RouterLink></Button
      >
      <label class="text-sm"
        >Reporting currency
        <select v-model="reportingCurrency" class="ml-2">
          <option value="">Native only</option>
          <option
            v-for="item in currencies.data.value?.currencies ?? []"
            :key="item.code"
            :value="item.code"
          >
            {{ item.code }} — {{ item.name }}
          </option>
        </select></label
      >
    </div>
    <p
      v-if="balances.isPending.value"
      role="status"
      class="text-muted-foreground py-8"
    >
      Loading balances…
    </p>
    <Card v-else-if="balances.isError.value" class="p-5"
      ><p class="form-error" role="alert">
        Balances could not be loaded.
      </p></Card
    >
    <template v-else-if="balances.data.value">
      <Card class="p-5 sm:p-6"
        ><p class="section-kicker">Overall</p>
        <h2 class="mb-4 font-bold">Your position</h2>
        <BalanceAmounts :amounts="totals"
      /></Card>
      <Card
        v-if="balances.data.value.pages[0]?.convertedSummary"
        class="p-5 sm:p-6"
      >
        <p class="section-kicker">Converted view</p>
        <h2 class="font-bold">
          {{
            formatCurrency(
              balances.data.value.pages[0].convertedSummary.netMinor,
              balances.data.value.pages[0].convertedSummary.reportingCurrency,
            )
          }}
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Write-time snapshots ·
          {{
            balances.data.value.pages[0].convertedSummary.incomplete
              ? "incomplete—native totals remain authoritative"
              : "complete"
          }}
        </p>
        <ul class="mt-3 space-y-1 text-xs">
          <li
            v-for="source in balances.data.value.pages[0].convertedSummary
              .sources"
            :key="`${source.source}:${source.capturedAt}`"
          >
            {{ source.source }} · effective {{ source.effectiveDate }} ·
            captured {{ source.capturedAt
            }}<template v-if="source.manual"> · manual</template
            ><template v-if="source.stale"> · stale</template>
          </li>
        </ul>
        <p
          v-if="balances.data.value.pages[0].convertedSummary.incomplete"
          class="mt-2 text-sm"
          role="status"
        >
          One or more immutable rate snapshots did not contain this reporting
          currency, so this converted net is partial and must not replace the
          native totals above.
        </p>
        <ul
          v-if="balances.data.value.pages[0].convertedSummary.warnings.length"
          class="mt-2 list-disc pl-5 text-sm"
        >
          <li
            v-for="warning in balances.data.value.pages[0].convertedSummary
              .warnings"
            :key="warning"
          >
            {{ warning }}
          </li>
        </ul>
      </Card>
      <div class="grid gap-4 md:grid-cols-2">
        <Card
          v-for="context in contexts"
          :key="`${context.contextType}:${context.contextId}`"
          class="p-5"
        >
          <p class="section-kicker">
            {{ context.contextType === "GROUP" ? "Group" : "Friend" }}
          </p>
          <h2 class="font-bold">{{ context.name }}</h2>
          <div class="mt-3"><BalanceAmounts :amounts="context.amounts" /></div>
          <RouterLink
            class="text-primary mt-4 inline-block text-sm font-semibold"
            :to="
              context.contextType === 'GROUP'
                ? `/groups/${context.contextId}/balances`
                : `/friends/${context.contextId}/balance`
            "
            >View details →</RouterLink
          >
        </Card>
      </div>
      <Button
        v-if="balances.hasNextPage.value"
        variant="outline"
        :disabled="balances.isFetchingNextPage.value"
        @click="balances.fetchNextPage()"
        >Load more balances</Button
      >
    </template>
  </div>
</template>
