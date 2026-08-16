<script setup lang="ts">
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/vue-query";
import {
  ArchiveRestore,
  Copy,
  Link,
  ShieldAlert,
  UserRoundPlus,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import GroupForm from "@/features/groups/GroupForm.vue";
import GroupMemberRow from "@/features/groups/GroupMemberRow.vue";
import {
  api,
  ApiError,
  type CreateGroupInput,
  type GroupRole,
} from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

const route = useRoute();
const router = useRouter();
const groupId = computed(() => String(route.params.groupId));
const notice = ref("");
const error = ref("");
const actionId = ref("");
const selectedUserId = ref("");

const group = useQuery(
  computed(() => ({
    queryKey: ["groups", "detail", groupId.value],
    queryFn: () => api.group(groupId.value),
  })),
);
const preferences = useQuery({
  queryKey: ["profile", "preference-options"],
  queryFn: api.profileOptions,
  staleTime: Infinity,
});
const friends = useInfiniteQuery({
  queryKey: ["friends", "accepted", "group-picker"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.friends(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor: string | null }) =>
    last.nextCursor ?? undefined,
});
const invitations = useInfiniteQuery(
  computed(() => ({
    queryKey: ["groups", groupId.value, "invitations"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.groupInvitations(groupId.value, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) =>
      last.nextCursor ?? undefined,
    enabled: group.data.value?.permissions.canCreateInvitations ?? false,
  })),
);
const members = useInfiniteQuery(
  computed(() => ({
    queryKey: ["groups", groupId.value, "members"],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.groupMembers(groupId.value, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) =>
      last.nextCursor ?? undefined,
  })),
);
const memberItems = computed(
  () => members.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const memberUserIds = computed(
  () => new Set(memberItems.value.map((member) => member.user.id)),
);
const availableFriends = computed(() =>
  (friends.data.value?.pages.flatMap((page) => page.items) ?? []).filter(
    (friend) => !memberUserIds.value.has(friend.user.id),
  ),
);
const invitationItems = computed(
  () => invitations.data.value?.pages.flatMap((page) => page.items) ?? [],
);

function message(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : fallback;
}
async function refresh(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["groups"] }),
    queryClient.invalidateQueries({
      queryKey: ["groups", "detail", groupId.value],
    }),
    queryClient.invalidateQueries({
      queryKey: ["groups", groupId.value, "members"],
    }),
  ]);
}

const save = useMutation({
  mutationFn: (input: CreateGroupInput) =>
    api.updateGroup(groupId.value, input),
  onSuccess: async () => {
    notice.value = "Group settings saved.";
    error.value = "";
    await refresh();
  },
  onError: (reason) => {
    error.value = message(reason, "The group could not be updated.");
  },
});
const addMember = useMutation({
  mutationFn: (userId: string) => api.addGroupMember(groupId.value, userId),
  onSuccess: async () => {
    notice.value = "Member added.";
    selectedUserId.value = "";
    await refresh();
  },
  onError: (reason) => {
    notice.value = message(reason, "The member could not be added.");
  },
});
const invitation = useMutation({
  mutationFn: () => api.createGroupInvitation(groupId.value),
  onSuccess: async () => {
    notice.value = "Invitation link created.";
    await queryClient.invalidateQueries({
      queryKey: ["groups", groupId.value, "invitations"],
    });
  },
  onError: (reason) => {
    notice.value = message(reason, "The invitation could not be created.");
  },
});

async function revokeInvitation(invitationId: string): Promise<void> {
  if (
    !window.confirm(
      "Revoke this invitation link? It will stop working immediately.",
    )
  )
    return;
  try {
    await api.revokeGroupInvitation(groupId.value, invitationId);
    notice.value = "Invitation revoked.";
    await queryClient.invalidateQueries({
      queryKey: ["groups", groupId.value, "invitations"],
    });
  } catch (reason) {
    notice.value = message(reason, "The invitation could not be revoked.");
  }
}

async function changeRole(
  membershipId: string,
  role: GroupRole,
): Promise<void> {
  if (role === "OWNER") return;
  actionId.value = membershipId;
  try {
    await api.updateGroupMemberRole(groupId.value, membershipId, role);
    notice.value = "Member role updated.";
    await refresh();
  } catch (reason) {
    notice.value = message(reason, "The role could not be updated.");
  } finally {
    actionId.value = "";
  }
}
async function removeMember(membershipId: string, name: string): Promise<void> {
  if (
    !window.confirm(
      `Remove ${name} from this group? Their financial history will remain intact.`,
    )
  )
    return;
  actionId.value = membershipId;
  try {
    await api.removeGroupMember(groupId.value, membershipId);
    notice.value = "Member removed.";
    await refresh();
  } catch (reason) {
    notice.value = message(reason, "The member could not be removed.");
  } finally {
    actionId.value = "";
  }
}
async function transfer(membershipId: string, name: string): Promise<void> {
  if (
    !window.confirm(`Transfer ownership to ${name}? You will become an admin.`)
  )
    return;
  actionId.value = membershipId;
  try {
    await api.transferGroupOwnership(groupId.value, membershipId);
    notice.value = "Ownership transferred.";
    await refresh();
  } catch (reason) {
    notice.value = message(reason, "Ownership could not be transferred.");
  } finally {
    actionId.value = "";
  }
}
async function copyInvitation(): Promise<void> {
  const url = invitation.data.value?.inviteUrl;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    notice.value = "Invitation link copied.";
  } catch {
    notice.value = "Copy the invitation link manually below.";
  }
}
async function archiveOrRestore(): Promise<void> {
  const current = group.data.value;
  if (!current) return;
  const restoring = current.status === "ARCHIVED";
  if (
    !restoring &&
    !window.confirm("Archive this group? Its history will remain available.")
  )
    return;
  try {
    await (restoring
      ? api.restoreGroup(groupId.value)
      : api.archiveGroup(groupId.value));
    notice.value = restoring ? "Group restored." : "Group archived.";
    await refresh();
  } catch (reason) {
    notice.value = message(
      reason,
      `The group could not be ${restoring ? "restored" : "archived"}.`,
    );
  }
}
async function leave(): Promise<void> {
  if (
    !window.confirm(
      "Leave this group? Existing financial history will remain visible to authorized members.",
    )
  )
    return;
  try {
    await api.leaveGroup(groupId.value);
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    await router.push("/groups");
  } catch (reason) {
    notice.value = message(reason, "You could not leave this group.");
  }
}
async function deleteGroup(): Promise<void> {
  if (
    !window.confirm(
      "Permanently delete this archived group? This cannot be undone.",
    )
  )
    return;
  try {
    await api.deleteGroup(groupId.value);
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    await router.push("/groups");
  } catch (reason) {
    notice.value = message(reason, "The group could not be deleted.");
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <p v-if="notice" role="status" class="text-sm">{{ notice }}</p>
    <p
      v-if="group.isPending.value"
      role="status"
      class="text-muted-foreground py-8 text-sm"
    >
      Loading settings…
    </p>
    <Card v-else-if="group.isError.value" class="p-5"
      ><p class="form-error" role="alert">
        This group could not be loaded.
      </p></Card
    >
    <template v-else-if="group.data.value">
      <Card v-if="group.data.value.permissions.canEdit" class="p-5 sm:p-6">
        <p class="section-kicker">Details</p>
        <h2 class="mt-1 text-xl font-bold">Group settings</h2>
        <GroupForm
          :initial="{
            name: group.data.value.name,
            type: group.data.value.type,
            defaultCurrency: group.data.value.defaultCurrency,
            simplifyDebtsEnabled: group.data.value.simplifyDebtsEnabled,
          }"
          :currencies="preferences.data.value?.currencies ?? []"
          submit-label="Save changes"
          :pending="save.isPending.value"
          :error="error"
          @submit="save.mutate"
        />
      </Card>

      <Card
        v-if="group.data.value.permissions.canManageMembers"
        class="p-5 sm:p-6"
      >
        <p class="section-kicker">People</p>
        <h2 class="mt-1 text-xl font-bold">Members</h2>
        <form
          class="mt-4 flex flex-col gap-2 sm:flex-row"
          @submit.prevent="selectedUserId && addMember.mutate(selectedUserId)"
        >
          <label class="sr-only" for="group-friend">Friend to add</label>
          <select
            id="group-friend"
            v-model="selectedUserId"
            required
            class="group-member-picker"
          >
            <option value="" disabled>Select a friend</option>
            <option
              v-for="friend in availableFriends"
              :key="friend.user.id"
              :value="friend.user.id"
            >
              {{ friend.user.name }}
            </option>
          </select>
          <Button
            type="submit"
            :disabled="!selectedUserId || addMember.isPending.value"
            ><UserRoundPlus :size="16" aria-hidden="true" /> Add member</Button
          >
          <Button
            v-if="friends.hasNextPage.value"
            type="button"
            variant="ghost"
            :disabled="friends.isFetchingNextPage.value"
            @click="friends.fetchNextPage()"
          >
            Load more friends
          </Button>
        </form>
        <ul class="mt-4 divide-y" aria-label="Manage group members">
          <GroupMemberRow
            v-for="member in memberItems"
            :key="member.membershipId"
            :member="member"
            :busy="actionId === member.membershipId"
            :can-remove="
              group.data.value.currentUserRole === 'OWNER' ||
              (group.data.value.currentUserRole === 'ADMIN' &&
                member.role === 'MEMBER')
            "
            :can-change-role="group.data.value.currentUserRole === 'OWNER'"
            :can-transfer="group.data.value.currentUserRole === 'OWNER'"
            @change-role="changeRole(member.membershipId, $event)"
            @remove="removeMember(member.membershipId, member.user.name)"
            @transfer="transfer(member.membershipId, member.user.name)"
          />
        </ul>
        <Button
          v-if="members.hasNextPage.value"
          class="mt-3"
          variant="ghost"
          size="sm"
          :disabled="members.isFetchingNextPage.value"
          @click="members.fetchNextPage()"
        >
          Load more members
        </Button>
      </Card>

      <Card
        v-if="group.data.value.permissions.canCreateInvitations"
        class="p-5 sm:p-6"
      >
        <p class="section-kicker">Invitation</p>
        <h2 class="mt-1 text-xl font-bold">Share a secure link</h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Invite someone without uploading an address book or configuring email
          delivery.
        </p>
        <Button
          class="mt-4"
          variant="outline"
          :disabled="invitation.isPending.value"
          @click="invitation.mutate()"
          ><Link :size="16" aria-hidden="true" /> Create link</Button
        >
        <div
          v-if="invitation.data.value"
          class="mt-3 flex flex-col gap-2 sm:flex-row"
        >
          <label class="sr-only" for="group-invite-url"
            >Group invitation link</label
          >
          <input
            id="group-invite-url"
            class="group-member-picker"
            readonly
            :value="invitation.data.value.inviteUrl"
          />
          <Button variant="outline" @click="copyInvitation"
            ><Copy :size="16" aria-hidden="true" /> Copy</Button
          >
        </div>
        <ul
          v-if="invitationItems.length"
          class="mt-4 divide-y"
          aria-label="Group invitations"
        >
          <li
            v-for="item in invitationItems"
            :key="item.invitationId"
            class="flex flex-wrap items-center gap-3 py-3"
          >
            <div class="min-w-0 flex-1">
              <strong class="block text-sm"
                >{{ item.status.toLowerCase() }} invitation</strong
              >
              <span class="text-muted-foreground text-xs">
                Created by {{ item.inviter.name }} · expires
                {{ new Date(item.expiresAt).toLocaleDateString() }}
              </span>
            </div>
            <Button
              v-if="item.status === 'ACTIVE'"
              variant="ghost"
              size="sm"
              @click="revokeInvitation(item.invitationId)"
            >
              Revoke
            </Button>
          </li>
        </ul>
        <Button
          v-if="invitations.hasNextPage.value"
          variant="ghost"
          size="sm"
          :disabled="invitations.isFetchingNextPage.value"
          @click="invitations.fetchNextPage()"
        >
          Load more invitations
        </Button>
      </Card>

      <Card class="p-5 sm:p-6">
        <p class="section-kicker">Group lifecycle</p>
        <h2 class="mt-1 text-xl font-bold">Archive, leave, or delete</h2>
        <p class="text-muted-foreground mt-1 text-sm">
          Archiving preserves the group and its future financial history.
          Permanent deletion is available only when the server confirms it is
          safe.
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button
            v-if="
              group.data.value.permissions.canArchive ||
              group.data.value.permissions.canRestore
            "
            variant="outline"
            @click="archiveOrRestore"
            ><ArchiveRestore :size="16" aria-hidden="true" />
            {{
              group.data.value.status === "ARCHIVED"
                ? "Restore group"
                : "Archive group"
            }}</Button
          >
          <Button
            v-if="group.data.value.permissions.canLeave"
            variant="outline"
            @click="leave"
            >Leave group</Button
          >
          <Button
            v-if="
              group.data.value.permissions.canDelete &&
              group.data.value.status === 'ARCHIVED'
            "
            class="danger-button"
            @click="deleteGroup"
            ><ShieldAlert :size="16" aria-hidden="true" /> Delete
            permanently</Button
          >
        </div>
      </Card>
    </template>
  </div>
</template>
