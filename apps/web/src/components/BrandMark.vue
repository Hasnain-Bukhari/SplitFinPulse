<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>

<template>
  <div class="flex items-center gap-3">
    <span class="brand-mark" aria-hidden="true"><span /></span>
    <span
      v-if="!compact"
      class="text-foreground text-[1.05rem] font-bold tracking-[-0.03em]"
    >
      SplitFin<span class="text-primary">Pulse</span>
    </span>
    <span class="sr-only">SplitFinPulse</span>
  </div>
</template>
