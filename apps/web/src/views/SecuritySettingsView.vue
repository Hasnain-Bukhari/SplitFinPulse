<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
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
    </section>
  </div>
</template>
