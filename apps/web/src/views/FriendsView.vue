<script setup lang="ts">
import { useInfiniteQuery, useMutation } from "@tanstack/vue-query";
import {
  ContactRound,
  Copy,
  Link,
  Search,
  Share2,
  UserRoundPlus,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FriendPersonRow from "@/features/friends/FriendPersonRow.vue";
import { selectedContactEmails } from "@/features/friends/contact-picker";
import {
  api,
  ApiError,
  type FriendDiscoveryResult,
  type FriendshipSummary,
} from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

const email = ref("");
const actionId = ref("");
const notice = ref("");
const contactMatches = ref<FriendDiscoveryResult[]>([]);
const requestedUserIds = ref(new Set<string>());

function infiniteOptions(
  key: readonly string[],
  loader: (cursor?: string) => ReturnType<typeof api.friends>,
) {
  return {
    queryKey: key,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      loader(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) =>
      last.nextCursor ?? undefined,
  };
}

const friends = useInfiniteQuery(
  infiniteOptions(["friends", "accepted"], api.friends),
);
const incoming = useInfiniteQuery(
  infiniteOptions(["friends", "incoming"], (cursor) =>
    api.friendRequests("incoming", cursor),
  ),
);
const outgoing = useInfiniteQuery(
  infiniteOptions(["friends", "outgoing"], (cursor) =>
    api.friendRequests("outgoing", cursor),
  ),
);

const friendItems = computed(
  () => friends.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const incomingItems = computed(
  () => incoming.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const outgoingItems = computed(
  () => outgoing.data.value?.pages.flatMap((page) => page.items) ?? [],
);

const discovery = useMutation({ mutationFn: api.discoverFriend });
const add = useMutation({
  mutationFn: api.createFriendRequest,
  onSuccess: async (_friendship, userId) => {
    requestedUserIds.value = new Set([...requestedUserIds.value, userId]);
    notice.value = "Friend request sent.";
    await refreshFriends();
  },
});
const accept = useMutation({ mutationFn: api.acceptFriendRequest });
const decline = useMutation({ mutationFn: api.declineFriendRequest });
const remove = useMutation({ mutationFn: api.removeFriend });
const invite = useMutation({ mutationFn: api.createFriendInvitation });
const contacts = useMutation({ mutationFn: api.discoverContacts });

const supportsContacts = computed(
  () => typeof navigator !== "undefined" && Boolean(navigator.contacts),
);
const supportsShare = computed(
  () => typeof navigator !== "undefined" && Boolean(navigator.share),
);

async function refreshFriends(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["friends"] });
}

function errorMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You are offline. Reconnect and try again.";
  }
  return error instanceof ApiError
    ? error.message
    : "The request could not be completed.";
}

async function runAction(
  id: string,
  operation: (id: string) => Promise<unknown>,
  message: string,
): Promise<void> {
  actionId.value = id;
  notice.value = "";
  try {
    await operation(id);
    notice.value = message;
    await refreshFriends();
  } catch (error) {
    notice.value = errorMessage(error);
  } finally {
    actionId.value = "";
  }
}

function search(): void {
  notice.value = "";
  discovery.mutate(email.value.trim().toLowerCase());
}

async function removeFriend(item: FriendshipSummary): Promise<void> {
  if (!window.confirm(`Remove ${item.user.name} from your friends?`)) return;
  await runAction(item.friendshipId, remove.mutateAsync, "Friend removed.");
}

async function createInvite(): Promise<void> {
  notice.value = "";
  try {
    await invite.mutateAsync();
    notice.value = "Invitation link created.";
  } catch (error) {
    notice.value = errorMessage(error);
  }
}

async function shareInvite(): Promise<void> {
  const inviteUrl = invite.data.value?.inviteUrl;
  if (!inviteUrl) return;
  try {
    if (navigator.share) {
      await navigator.share({
        title: "Join me on SplitFinPulse",
        text: "Connect with me to share expenses.",
        url: inviteUrl,
      });
      notice.value = "Invitation shared.";
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      notice.value = "Invitation link copied.";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    notice.value = "Copy the invitation link manually below.";
  }
}

async function chooseContacts(): Promise<void> {
  if (!navigator.contacts) return;
  notice.value = "";
  try {
    const selected = await navigator.contacts.select(["name", "email"], {
      multiple: true,
    });
    const emails = selectedContactEmails(selected);
    if (emails.length === 0) {
      notice.value = "No email addresses were selected.";
      return;
    }
    contactMatches.value = await contacts.mutateAsync(emails);
    notice.value = contactMatches.value.length
      ? "Choose which matched contacts to add."
      : "No selected contacts have an account yet. Share an invitation link instead.";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    notice.value = errorMessage(error);
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <p v-if="notice" class="text-sm" role="status">{{ notice }}</p>

    <div class="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <Card class="p-5 sm:p-6">
        <div class="mb-5">
          <p class="section-kicker">Find people</p>
          <h2 class="text-xl font-bold">Add a friend</h2>
          <p class="text-muted-foreground mt-1 text-sm">
            Search using their complete account email. There is no public
            directory.
          </p>
        </div>
        <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="search">
          <label class="sr-only" for="friend-email">Account email</label>
          <input
            id="friend-email"
            v-model="email"
            required
            type="email"
            autocomplete="email"
            placeholder="friend@example.com"
            class="border-border bg-surface focus:ring-ring h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none"
          />
          <Button type="submit" :disabled="discovery.isPending.value">
            <Search :size="16" aria-hidden="true" /> Search
          </Button>
          <Button
            v-if="supportsContacts"
            type="button"
            variant="outline"
            :disabled="contacts.isPending.value"
            @click="chooseContacts"
          >
            <ContactRound :size="16" aria-hidden="true" /> Choose contacts
          </Button>
        </form>
        <p v-if="discovery.isError.value" class="form-error mt-3" role="alert">
          {{ errorMessage(discovery.error.value) }}
        </p>
        <div
          v-if="discovery.data.value"
          class="bg-surface-raised mt-4 flex items-center gap-3 rounded-xl p-3"
        >
          <UserRoundPlus :size="20" aria-hidden="true" />
          <strong class="min-w-0 flex-1 truncate text-sm">
            {{ discovery.data.value.user.name }}
          </strong>
          <span
            v-if="
              discovery.data.value.relationship ||
              requestedUserIds.has(discovery.data.value.user.id)
            "
            class="text-muted-foreground text-xs"
          >
            {{
              discovery.data.value.relationship?.status.toLowerCase() ??
              "pending"
            }}
          </span>
          <Button
            v-else
            size="sm"
            :disabled="add.isPending.value"
            @click="add.mutate(discovery.data.value.user.id)"
            >Add friend</Button
          >
        </div>
        <ul
          v-if="contactMatches.length"
          class="mt-3"
          aria-label="Matched contacts"
        >
          <li
            v-for="match in contactMatches"
            :key="match.user.id"
            class="flex items-center gap-3 border-t py-3"
          >
            <strong class="min-w-0 flex-1 truncate text-sm">{{
              match.user.name
            }}</strong>
            <span
              v-if="match.relationship || requestedUserIds.has(match.user.id)"
              class="text-muted-foreground text-xs"
            >
              {{ match.relationship?.status.toLowerCase() ?? "pending" }}
            </span>
            <Button v-else size="sm" @click="add.mutate(match.user.id)"
              >Add</Button
            >
          </li>
        </ul>
      </Card>

      <Card class="p-5 sm:p-6">
        <p class="section-kicker">Invitation</p>
        <h2 class="text-xl font-bold">Share a secure link</h2>
        <p class="text-muted-foreground mt-1 text-sm">
          The first eligible person to accept becomes your friend. Links expire
          after seven days.
        </p>
        <Button
          class="mt-4"
          :disabled="invite.isPending.value"
          @click="createInvite"
        >
          <Link :size="16" aria-hidden="true" /> Create invitation
        </Button>
        <div v-if="invite.data.value" class="mt-4 space-y-2">
          <label class="text-xs font-semibold" for="invite-url"
            >Invitation link</label
          >
          <input
            id="invite-url"
            readonly
            :value="invite.data.value.inviteUrl"
            class="border-border bg-surface-raised h-10 w-full rounded-lg border px-3 text-xs"
          />
          <Button variant="outline" size="sm" @click="shareInvite">
            <Share2 v-if="supportsShare" :size="15" aria-hidden="true" />
            <Copy v-else :size="15" aria-hidden="true" />
            {{ supportsShare ? "Share" : "Copy" }} link
          </Button>
        </div>
      </Card>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <Card class="p-5">
        <h2 class="font-bold">Friends</h2>
        <p
          v-if="friends.isPending.value"
          class="text-muted-foreground py-6 text-sm"
        >
          Loading friends…
        </p>
        <p
          v-else-if="friends.isError.value"
          class="form-error py-4"
          role="alert"
        >
          {{ errorMessage(friends.error.value) }}
        </p>
        <p
          v-else-if="friendItems.length === 0"
          class="text-muted-foreground py-6 text-sm"
        >
          No friends yet.
        </p>
        <ul v-else>
          <FriendPersonRow
            v-for="item in friendItems"
            :key="item.friendshipId"
            :item="item"
            kind="accepted"
            :busy="actionId === item.friendshipId"
            @remove="removeFriend(item)"
          />
        </ul>
        <Button
          v-if="friends.hasNextPage.value"
          variant="ghost"
          size="sm"
          :disabled="friends.isFetchingNextPage.value"
          @click="friends.fetchNextPage()"
          >Load more</Button
        >
      </Card>

      <Card class="p-5">
        <h2 class="font-bold">Incoming requests</h2>
        <p
          v-if="incoming.isPending.value"
          class="text-muted-foreground py-6 text-sm"
        >
          Loading requests…
        </p>
        <p
          v-else-if="incoming.isError.value"
          class="form-error py-4"
          role="alert"
        >
          {{ errorMessage(incoming.error.value) }}
        </p>
        <p
          v-else-if="incomingItems.length === 0"
          class="text-muted-foreground py-6 text-sm"
        >
          No pending requests.
        </p>
        <ul v-else>
          <FriendPersonRow
            v-for="item in incomingItems"
            :key="item.friendshipId"
            :item="item"
            kind="incoming"
            :busy="actionId === item.friendshipId"
            @accept="
              runAction($event, accept.mutateAsync, 'Friend request accepted.')
            "
            @decline="
              runAction($event, decline.mutateAsync, 'Friend request declined.')
            "
          />
        </ul>
        <Button
          v-if="incoming.hasNextPage.value"
          variant="ghost"
          size="sm"
          @click="incoming.fetchNextPage()"
          >Load more</Button
        >
      </Card>

      <Card class="p-5">
        <h2 class="font-bold">Sent requests</h2>
        <p
          v-if="outgoing.isPending.value"
          class="text-muted-foreground py-6 text-sm"
        >
          Loading requests…
        </p>
        <p
          v-else-if="outgoing.isError.value"
          class="form-error py-4"
          role="alert"
        >
          {{ errorMessage(outgoing.error.value) }}
        </p>
        <p
          v-else-if="outgoingItems.length === 0"
          class="text-muted-foreground py-6 text-sm"
        >
          No sent requests.
        </p>
        <ul v-else>
          <FriendPersonRow
            v-for="item in outgoingItems"
            :key="item.friendshipId"
            :item="item"
            kind="outgoing"
          />
        </ul>
        <Button
          v-if="outgoing.hasNextPage.value"
          variant="ghost"
          size="sm"
          @click="outgoing.fetchNextPage()"
          >Load more</Button
        >
      </Card>
    </div>
  </div>
</template>
