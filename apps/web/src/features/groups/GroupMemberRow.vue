<script setup lang="ts">
import { UserRound } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { GroupMember, GroupRole } from "@/lib/api/client";
import { groupRoleLabels } from "./group-display";

defineProps<{
  member: GroupMember;
  canRemove: boolean;
  canChangeRole: boolean;
  canTransfer?: boolean;
  busy?: boolean;
}>();

defineEmits<{
  changeRole: [role: GroupRole];
  remove: [];
  transfer: [];
}>();
</script>

<template>
  <li class="group-member-row">
    <img
      v-if="member.user.avatarUrl"
      :src="member.user.avatarUrl"
      alt=""
      class="group-member-avatar"
    />
    <span v-else class="group-member-avatar" aria-hidden="true">
      <UserRound :size="18" />
    </span>
    <div class="min-w-0 flex-1">
      <strong class="block truncate text-sm">{{ member.user.name }}</strong>
      <span class="text-muted-foreground text-xs">
        {{ groupRoleLabels[member.role] }}
      </span>
    </div>
    <template v-if="member.role !== 'OWNER'">
      <label class="sr-only" :for="`role-${member.membershipId}`">
        Role for {{ member.user.name }}
      </label>
      <select
        v-if="canChangeRole"
        :id="`role-${member.membershipId}`"
        class="compact-select"
        :value="member.role"
        :disabled="busy"
        @change="
          $emit(
            'changeRole',
            ($event.target as HTMLSelectElement).value as GroupRole,
          )
        "
      >
        <option value="ADMIN">Admin</option>
        <option value="MEMBER">Member</option>
      </select>
      <Button
        v-if="canTransfer"
        variant="ghost"
        size="sm"
        :disabled="busy"
        :aria-label="`Transfer group ownership to ${member.user.name}`"
        @click="$emit('transfer')"
      >
        Make owner
      </Button>
      <Button
        v-if="canRemove"
        variant="ghost"
        size="sm"
        :disabled="busy"
        :aria-label="`Remove ${member.user.name} from group`"
        @click="$emit('remove')"
      >
        Remove
      </Button>
    </template>
  </li>
</template>
