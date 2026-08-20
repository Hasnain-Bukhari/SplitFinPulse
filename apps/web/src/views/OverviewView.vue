<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Sparkles,
  UsersRound,
  WalletCards,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { computed } from "vue";
import { api } from "@/lib/api/client";
import { useCurrencyFormatter } from "@/features/expenses/useCurrencyFormatter";
import ActivityFeed from "@/features/activity/ActivityFeed.vue";
import { sessionQueryOptions } from "@/lib/query-client";

const session = useQuery(sessionQueryOptions);
const balances = useQuery(
  computed(() => ({
    queryKey: ["balances", "overall", session.data.value?.user.defaultCurrency],
    queryFn: () =>
      api.balances(undefined, session.data.value?.user.defaultCurrency),
    enabled: Boolean(session.data.value),
  })),
);
const { formatCurrency } = useCurrencyFormatter();
const summaryCards = computed(() => {
  const totals = balances.data.value?.totals ?? [];
  if (!totals.length)
    return [
      {
        label: "Your balance",
        value: "—",
        helper: balances.isPending.value ? "Loading…" : "No activity yet",
        icon: WalletCards,
      },
      {
        label: "Owed to you",
        value: "—",
        helper: "Nothing outstanding",
        icon: ArrowDownLeft,
      },
      {
        label: "You owe",
        value: "—",
        helper: "All clear",
        icon: ArrowUpRight,
      },
    ];
  return totals.flatMap((item) => [
    {
      label: `Your ${item.currency} balance`,
      value: formatCurrency(item.netMinor, item.currency),
      helper: "Net position",
      icon: WalletCards,
    },
    {
      label: `Owed to you · ${item.currency}`,
      value: formatCurrency(item.youAreOwedMinor, item.currency),
      helper: "Across active expenses",
      icon: ArrowDownLeft,
    },
    {
      label: `You owe · ${item.currency}`,
      value: formatCurrency(item.youOweMinor, item.currency),
      helper: "Across active expenses",
      icon: ArrowUpRight,
    },
  ]);
});
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <section class="welcome-panel" aria-labelledby="welcome-title">
      <div class="relative z-10 max-w-2xl">
        <div class="eyebrow">
          <Sparkles :size="14" aria-hidden="true" /> A clearer money picture
        </div>
        <h2 id="welcome-title">
          Money shared.<br /><span>Clarity kept.</span>
        </h2>
        <p>
          SplitFinPulse will bring personal accounts and shared expenses into
          one calm, explainable view.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <Button as-child
            ><RouterLink to="/expenses/new"
              ><Plus :size="17" aria-hidden="true" /> Add an expense</RouterLink
            ></Button
          >
          <Button as-child variant="outline">
            <RouterLink to="/groups/new">
              <UsersRound :size="17" aria-hidden="true" /> Create a group
            </RouterLink>
          </Button>
          <Button
            v-if="balances.data.value?.contexts.length"
            as-child
            variant="outline"
          >
            <RouterLink to="/settlements/new">Settle up</RouterLink>
          </Button>
        </div>
      </div>
      <div class="pulse-orbit" aria-hidden="true"><span /><span /><span /></div>
    </section>

    <section aria-labelledby="summary-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Snapshot</p>
          <h2 id="summary-title">Your financial position</h2>
        </div>
        <RouterLink class="data-note" to="/balances"
          >View all balances</RouterLink
        >
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <Card
          v-for="item in summaryCards"
          :key="item.label"
          class="summary-card"
        >
          <div class="summary-icon">
            <component :is="item.icon" :size="19" aria-hidden="true" />
          </div>
          <p>{{ item.label }}</p>
          <strong class="tabular-nums">{{ item.value }}</strong>
          <span>{{ item.helper }}</span>
        </Card>
      </div>
      <Card v-if="balances.data.value?.convertedSummary" class="mt-3 p-4">
        <p class="section-kicker">Converted summary</p>
        <strong class="tabular-nums text-lg">{{
          formatCurrency(
            balances.data.value.convertedSummary.netMinor,
            balances.data.value.convertedSummary.reportingCurrency,
          )
        }}</strong>
        <p class="text-muted-foreground mt-1 text-xs">
          Write-time rate snapshots ·
          {{
            balances.data.value.convertedSummary.incomplete
              ? "incomplete; native balances remain authoritative"
              : "all entries converted"
          }}
        </p>
        <p
          v-if="balances.data.value.convertedSummary.sources[0]"
          class="text-muted-foreground mt-1 text-xs"
        >
          {{ balances.data.value.convertedSummary.sources[0].source }} ·
          effective
          {{ balances.data.value.convertedSummary.sources[0].effectiveDate }} ·
          captured
          {{ balances.data.value.convertedSummary.sources[0].capturedAt }}
          <template
            v-if="balances.data.value.convertedSummary.sources[0].manual"
          >
            · manual</template
          >
        </p>
      </Card>
    </section>

    <div class="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <Card class="min-h-72 p-5 sm:p-6">
        <div class="section-heading mb-8">
          <div>
            <p class="section-kicker">Timeline</p>
            <h2>Recent activity</h2>
          </div>
          <RouterLink class="data-note" to="/activity">View all</RouterLink>
        </div>
        <ActivityFeed :limit="4" />
      </Card>

      <Card class="insight-card min-h-72 p-5 sm:p-6">
        <div>
          <p class="section-kicker section-kicker--light">Built for clarity</p>
          <h2>Traceable by design</h2>
          <p>
            Every expense, payment, correction, and discussion stays attached to
            an explainable history.
          </p>
        </div>
        <div class="insight-lines" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </Card>
    </div>
  </div>
</template>
