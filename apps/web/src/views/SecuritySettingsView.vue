<script setup lang="ts">
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRouter } from "vue-router";
import SettingsNav from "@/components/SettingsNav.vue";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { queryClient, sessionQueryKey } from "@/lib/query-client";

const router = useRouter();
const sessions = useQuery({
  queryKey: ["auth", "sessions"],
  queryFn: api.sessions,
});
const securityEvents = useInfiniteQuery({
  queryKey: ["auth", "security-events"],
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    api.securityAudit(pageParam),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const securityEventItems = computed(
  () => securityEvents.data.value?.pages.flatMap((page) => page.items) ?? [],
);
function securityEventLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
const revoke = useMutation({
  mutationFn: api.revokeSession,
  onSuccess: async (_, id) => {
    const current = sessions.data.value?.find(
      (session) => session.id === id,
    )?.current;
    if (current) {
      queryClient.removeQueries({ queryKey: sessionQueryKey });
      await router.replace("/login");
    } else await sessions.refetch();
  },
});
const revokeAll = useMutation({
  mutationFn: api.revokeAllSessions,
  onSuccess: async () => {
    queryClient.clear();
    await router.replace("/login");
  },
});
</script>

<template>
  <div class="settings-layout">
    <SettingsNav />
    <section class="settings-panel" aria-labelledby="security-heading">
      <h2 id="security-heading">Active sessions</h2>
      <p>Review browsers that currently have access to your account.</p>
      <p v-if="sessions.isLoading.value" role="status">Loading sessions…</p>
      <div class="session-list">
        <article
          v-for="item in sessions.data.value"
          :key="item.id"
          class="session-card"
        >
          <div>
            <strong>{{
              item.current ? "This browser" : "Browser session"
            }}</strong>
            <p>{{ item.deviceDescription }}</p>
            <small
              >Last used {{ new Date(item.lastUsedAt).toLocaleString() }}</small
            >
          </div>
          <Button variant="outline" @click="revoke.mutate(item.id)"
            >Sign out</Button
          >
        </article>
      </div>
      <Button variant="outline" class="mt-6" @click="revokeAll.mutate()"
        >Sign out everywhere</Button
      >
      <div class="mt-10 border-t pt-8">
        <h2>Security history</h2>
        <p>
          Sensitive account and authentication changes recorded for your review.
        </p>
        <p v-if="securityEvents.isPending.value" class="mt-4" role="status">
          Loading security history…
        </p>
        <p
          v-else-if="securityEvents.isError.value"
          class="form-error mt-4"
          role="alert"
        >
          Security history could not be loaded.
        </p>
        <p
          v-else-if="!securityEventItems.length"
          class="text-muted-foreground mt-4 text-sm"
        >
          No security events recorded.
        </p>
        <ol v-else class="session-list" aria-label="Security history">
          <li
            v-for="item in securityEventItems"
            :key="item.id"
            class="session-card"
          >
            <div>
              <strong>{{ securityEventLabel(item.action) }}</strong>
              <p>{{ item.outcome }}</p>
              <time
                :datetime="item.createdAt"
                class="text-muted-foreground text-xs"
                >{{ new Date(item.createdAt).toLocaleString() }}</time
              >
            </div>
          </li>
        </ol>
        <Button
          v-if="securityEvents.hasNextPage.value"
          class="mt-4"
          size="sm"
          variant="ghost"
          :disabled="securityEvents.isFetchingNextPage.value"
          @click="securityEvents.fetchNextPage()"
          >Load older events</Button
        >
      </div>
    </section>
  </div>
</template>
