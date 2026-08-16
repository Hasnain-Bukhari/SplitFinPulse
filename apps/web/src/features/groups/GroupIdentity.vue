<script setup lang="ts">
import { computed } from "vue";
import { groupInitials } from "./group-display";

const props = withDefaults(
  defineProps<{ name: string; imageUrl?: string | null; size?: "sm" | "lg" }>(),
  { imageUrl: null, size: "sm" },
);

const initials = computed(() => groupInitials(props.name));
</script>

<template>
  <span
    class="group-identity"
    :class="size === 'lg' && 'group-identity--large'"
    aria-hidden="true"
  >
    <img v-if="imageUrl" :src="imageUrl" alt="" />
    <span v-else>{{ initials }}</span>
  </span>
</template>
