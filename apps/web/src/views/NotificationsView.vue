<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type NotificationItem } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
const unreadOnly = ref(false);
const client = useQueryClient();
const router = useRouter();
const notifications = useQuery(
  computed(() => ({
    queryKey: ["notifications", unreadOnly.value],
    queryFn: () => api.notifications(undefined, unreadOnly.value),
  })),
);
const read = useMutation({
  mutationFn: api.markNotificationRead,
  onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
});
const readAll = useMutation({
  mutationFn: api.markAllNotificationsRead,
  onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
});
function routeFor(item: NotificationItem): string | undefined {
  if (!item.target) return undefined;
  if (item.target.type === "EXPENSE" || item.target.type === "COMMENT")
    return `/expenses/${item.target.id}`;
  if (item.target.type === "GROUP" || item.target.type === "GROUP_MEMBER")
    return `/groups/${item.target.id}`;
  if (item.target.type === "SETTLEMENT")
    return `/settlements/${item.target.id}`;
  if (item.target.type === "GROUP_BALANCE")
    return `/groups/${item.target.id}/balances`;
  if (item.target.type === "FRIEND_BALANCE")
    return `/friends/${item.target.id}/balance`;
  if (item.target.type === "BUDGET") return "/budgets";
  return undefined;
}
async function activate(item: NotificationItem) {
  if (!item.readAt) await read.mutateAsync(item.id);
  const target = routeFor(item);
  if (target) await router.push(target);
}
</script>
<template>
  <div class="mx-auto max-w-4xl space-y-5">
    <div class="section-heading">
      <div>
        <p class="section-kicker">Updates</p>
        <h1 class="text-2xl font-bold">Notifications</h1>
      </div>
      <Button variant="outline" @click="readAll.mutate()">Mark all read</Button>
    </div>
    <div class="flex gap-2">
      <Button
        :variant="unreadOnly ? 'outline' : 'default'"
        @click="unreadOnly = false"
        >All</Button
      ><Button
        :variant="unreadOnly ? 'default' : 'outline'"
        @click="unreadOnly = true"
        >Unread</Button
      ><Button as-child variant="ghost"
        ><RouterLink to="/settings/profile">Preferences</RouterLink></Button
      >
    </div>
    <p v-if="notifications.isPending.value" role="status">
      Loading notifications…
    </p>
    <p v-else-if="notifications.isError.value" class="form-error" role="alert">
      Notifications could not be loaded.
    </p>
    <Card v-else-if="!notifications.data.value?.items.length" class="p-6"
      >No notifications here.</Card
    >
    <ul v-else class="space-y-2">
      <li v-for="item in notifications.data.value?.items" :key="item.id">
        <button class="w-full text-left" type="button" @click="activate(item)">
          <Card :class="!item.readAt ? 'border-primary p-4' : 'p-4'"
            ><div class="flex justify-between gap-3">
              <strong>{{ item.type.replaceAll("_", " ").toLowerCase() }}</strong
              ><span class="text-muted-foreground text-xs">{{
                new Date(item.occurredAt).toLocaleString()
              }}</span>
            </div>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ item.actor?.name ?? "SplitFinPulse" }} ·
              {{ item.category.replaceAll("_", " ").toLowerCase() }}
            </p>
            <span
              v-if="!item.readAt"
              class="mt-2 inline-block text-xs font-bold"
              >Unread</span
            ></Card
          >
        </button>
      </li>
    </ul>
  </div>
</template>
