<script setup lang="ts">
import { Laptop, Moon, Sun } from "@lucide/vue";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/composables/useTheme";

const { theme, cycleTheme } = useTheme();
const label = computed(
  () => `Theme: ${theme.value}. Activate to change theme.`,
);
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :aria-label="label"
    :title="label"
    @click="cycleTheme"
  >
    <Sun v-if="theme === 'light'" :size="18" aria-hidden="true" />
    <Moon v-else-if="theme === 'dark'" :size="18" aria-hidden="true" />
    <Laptop v-else :size="18" aria-hidden="true" />
  </Button>
</template>
