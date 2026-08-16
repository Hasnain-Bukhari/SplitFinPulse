<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import { Link, LogIn, UserRoundCheck } from "@lucide/vue";
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
  queryKey: computed(() => ["friend-invitation", token.value]),
  queryFn: () => api.friendInvitation(token.value),
  retry: false,
});
const session = useQuery(sessionQueryOptions);
const accept = useMutation({
  mutationFn: () => api.acceptFriendInvitation(token.value),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["friends"] });
    await router.replace("/friends");
  },
});

const error = computed(() => {
  const value = invitation.error.value ?? accept.error.value;
  return value instanceof ApiError
    ? value.message
    : value
      ? "The invitation could not be opened."
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
      <div class="auth-icon mx-auto"><Link aria-hidden="true" /></div>
      <template v-if="invitation.isPending.value">
        <h1>Opening invitation</h1>
        <p>Checking that this secure link is still available…</p>
      </template>
      <template v-else-if="invitation.data.value">
        <h1>{{ invitation.data.value.inviter.name }} invited you</h1>
        <p v-if="invitation.data.value.status === 'ACTIVE'">
          Connect on SplitFinPulse to share expenses together.
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
          <UserRoundCheck :size="18" aria-hidden="true" /> Accept invitation
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
