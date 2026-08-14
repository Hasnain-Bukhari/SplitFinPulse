<script setup lang="ts">
import { Slot } from "reka-ui";
import { cn } from "@/lib/utils";

withDefaults(
  defineProps<{
    asChild?: boolean;
    variant?: "default" | "outline" | "ghost";
    size?: "default" | "sm" | "icon";
    class?: string;
  }>(),
  {
    asChild: false,
    variant: "default",
    size: "default",
  },
);
</script>

<template>
  <component
    :is="asChild ? Slot : 'button'"
    :class="
      cn(
        'focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' &&
          'bg-primary text-primary-foreground hover:bg-primary-hover',
        variant === 'outline' &&
          'border-border bg-surface text-foreground hover:bg-surface-raised border',
        variant === 'ghost' &&
          'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
        size === 'default' && 'h-10 px-4 py-2',
        size === 'sm' && 'h-8 rounded-md px-3 text-xs',
        size === 'icon' && 'size-10',
        $props.class,
      )
    "
  >
    <slot />
  </component>
</template>
