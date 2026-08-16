<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import { LogIn, UsersRound } from "@lucide/vue";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import BrandMark from "@/components/BrandMark.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";
import { queryClient, sessionQueryOptions } from "@/lib/query-client";

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token ?? ""));
const invitation = useQuery({
  queryKey: computed(() => ["group-invitation", token.value]),
  queryFn: () => api.groupInvitation(token.value),
  retry: false,
});
const session = useQuery(sessionQueryOptions);
const accept = useMutation({
  mutationFn: () => api.acceptGroupInvitation(token.value),
  onSuccess: async (group) => {
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    await router.replace(`/groups/${group.id}`);
  },
});
const error = computed(() => {
  const value = invitation.error.value ?? accept.error.value;
  return value instanceof ApiError
    ? value.message
    : value
      ? "The group invitation could not be opened."
      : "";
});
function signIn(): void {
  window.location.assign(api.googleLoginUrl(route.fullPath));
}
</script>

<template>
  <main id="main-content" class="auth-page">
    <div class="auth-topbar"><BrandMark /><ThemeToggle /></div>
    <section class="auth-card text-center" aria-live="polite">
      <div class="auth-icon mx-auto"><UsersRound aria-hidden="true" /></div>
      <template v-if="invitation.isPending.value">
        <h1>Opening group invitation</h1>
        <p>Checking that this secure link is still available…</p>
      </template>
      <template v-else-if="invitation.data.value">
        <h1>Join {{ invitation.data.value.group.name }}</h1>
        <p v-if="invitation.data.value.status === 'ACTIVE'">
          {{ invitation.data.value.inviter.name }} invited you to this group.
        </p>
        <p v-else class="form-error" role="alert">
          This invitation is {{ invitation.data.value.status.toLowerCase() }}.
        </p>
        <Button
          v-if="invitation.data.value.status === 'ACTIVE' && session.data.value"
          class="mt-5 w-full"
          :disabled="accept.isPending.value"
          @click="accept.mutate()"
        >
          <UsersRound :size="18" aria-hidden="true" /> Accept invitation
        </Button>
        <Button
          v-else-if="invitation.data.value.status === 'ACTIVE'"
          class="mt-5 w-full"
          @click="signIn"
        >
          <LogIn :size="18" aria-hidden="true" /> Sign in to accept
        </Button>
      </template>
      <p v-if="error" class="form-error mt-4" role="alert">{{ error }}</p>
      <RouterLink
        class="text-primary mt-5 inline-block text-sm font-semibold"
        to="/"
      >
        Go to SplitFinPulse
      </RouterLink>
    </section>
  </main>
</template>
