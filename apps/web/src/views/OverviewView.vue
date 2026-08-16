<script setup lang="ts">
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ReceiptText,
  Sparkles,
  UsersRound,
  WalletCards,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const summaryCards = [
  {
    label: "Your balance",
    value: "—",
    helper: "No activity yet",
    icon: WalletCards,
  },
  {
    label: "Owed to you",
    value: "—",
    helper: "Nothing outstanding",
    icon: ArrowDownLeft,
  },
  { label: "You owe", value: "—", helper: "All clear", icon: ArrowUpRight },
];
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
          <Button disabled title="Available after account setup">
            <Plus :size="17" aria-hidden="true" /> Add an expense
          </Button>
          <Button as-child variant="outline">
            <RouterLink to="/groups/new">
              <UsersRound :size="17" aria-hidden="true" /> Create a group
            </RouterLink>
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
        <span class="data-note">Amounts appear after setup</span>
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
    </section>

    <div class="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <Card class="min-h-72 p-5 sm:p-6">
        <div class="section-heading mb-8">
          <div>
            <p class="section-kicker">Timeline</p>
            <h2>Recent activity</h2>
          </div>
        </div>
        <div class="empty-state">
          <span class="empty-state-icon"
            ><ReceiptText :size="24" aria-hidden="true"
          /></span>
          <h3>Your story starts here</h3>
          <p>
            Expenses, settlements, and changes will form an auditable timeline.
          </p>
        </div>
      </Card>

      <Card class="insight-card min-h-72 p-5 sm:p-6">
        <div>
          <p class="section-kicker section-kicker--light">Coming next</p>
          <h2>A trustworthy foundation</h2>
          <p>
            Secure identity comes first, then every account, split, and
            settlement stays attached to the right person.
          </p>
        </div>
        <div class="insight-lines" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </Card>
    </div>
  </div>
</template>
