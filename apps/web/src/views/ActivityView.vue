<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Card } from "@/components/ui/card";
import ActivityFeed from "@/features/activity/ActivityFeed.vue";

const route = useRoute();
const groupId = computed(() =>
  typeof route.params.groupId === "string" ? route.params.groupId : undefined,
);
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <div>
      <p class="section-kicker">Timeline</p>
      <h1 class="text-2xl font-bold">
        {{ groupId ? "Group activity" : "Activity" }}
      </h1>
      <p class="text-muted-foreground mt-1 text-sm">
        A readable history of expenses, payments, comments, and group changes.
      </p>
    </div>
    <Card class="p-5 sm:p-6"><ActivityFeed :group-id="groupId" /></Card>
  </div>
</template>
