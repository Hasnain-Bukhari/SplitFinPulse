<script setup lang="ts">
import { Construction } from "@lucide/vue";
import { useRoute } from "vue-router";
import { computed } from "vue";
import { Card } from "@/components/ui/card";

const route = useRoute();
const title = computed(() => String(route.meta.title ?? "Workspace"));
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <Card class="empty-page">
      <span class="empty-state-icon"
        ><Construction :size="24" aria-hidden="true"
      /></span>
      <p class="section-kicker">Foundation ready</p>
      <h2>{{ title }} will live here</h2>
      <p>
        This space is intentionally empty until its product rules and data model
        are implemented.
      </p>
    </Card>
  </div>
</template>
