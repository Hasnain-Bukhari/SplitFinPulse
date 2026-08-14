<script setup lang="ts">
import { cn } from "@/lib/utils";

defineProps<{ class?: string }>();
</script>

<template>
  <section
    :class="
      cn(
        'border-border bg-surface rounded-2xl border shadow-[var(--shadow-card)]',
        $props.class,
      )
    "
  >
    <slot />
  </section>
</template>
