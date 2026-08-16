<script setup lang="ts">
import { Check, UserRound, UserRoundMinus, X } from "@lucide/vue";
import type { FriendshipSummary } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

defineProps<{
  item: FriendshipSummary;
  kind: "accepted" | "incoming" | "outgoing";
  busy?: boolean;
}>();

defineEmits<{
  accept: [id: string];
  decline: [id: string];
  remove: [id: string];
}>();
</script>

<template>
  <li class="flex items-center gap-3 border-b py-4 last:border-b-0">
    <img
      v-if="item.user.avatarUrl"
      :src="item.user.avatarUrl"
      alt=""
      class="size-10 rounded-full object-cover"
    />
    <span
      v-else
      class="bg-surface-raised text-muted-foreground grid size-10 place-items-center rounded-full"
      aria-hidden="true"
    >
      <UserRound :size="20" />
    </span>
    <div class="min-w-0 flex-1">
      <strong class="block truncate text-sm">{{ item.user.name }}</strong>
      <span v-if="kind === 'accepted'" class="text-muted-foreground text-xs">
        Balance available with shared expenses
      </span>
      <span v-else class="text-muted-foreground text-xs">
        {{ kind === "incoming" ? "Wants to connect" : "Request sent" }}
      </span>
    </div>
    <div v-if="kind === 'incoming'" class="flex gap-1">
      <Button
        size="sm"
        :disabled="busy"
        :aria-label="`Accept ${item.user.name}`"
        @click="$emit('accept', item.friendshipId)"
      >
        <Check :size="15" aria-hidden="true" /> Accept
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :disabled="busy"
        :aria-label="`Decline ${item.user.name}`"
        @click="$emit('decline', item.friendshipId)"
      >
        <X :size="16" aria-hidden="true" />
      </Button>
    </div>
    <Button
      v-else-if="kind === 'accepted'"
      variant="ghost"
      size="icon"
      :disabled="busy"
      :aria-label="`Remove ${item.user.name}`"
      @click="$emit('remove', item.friendshipId)"
    >
      <UserRoundMinus :size="17" aria-hidden="true" />
    </Button>
  </li>
</template>
