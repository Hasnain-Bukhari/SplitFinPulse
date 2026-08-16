<script setup lang="ts">
import { LoaderCircle } from "@lucide/vue";
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/lib/api/client";
import { queryClient, sessionQueryKey } from "@/lib/query-client";

const route = useRoute();
const router = useRouter();
const error = ref("");

onMounted(async () => {
  try {
    const session = await api.session();
    queryClient.setQueryData(sessionQueryKey, session);
    const candidate =
      typeof route.query.returnTo === "string" ? route.query.returnTo : "/";
    await router.replace(
      candidate.startsWith("/") && !candidate.startsWith("//")
        ? candidate
        : "/",
    );
  } catch {
    error.value = "We could not finish signing you in. Please try again.";
  }
});
</script>

<template>
  <main id="main-content" class="auth-page">
    <section class="auth-card text-center" aria-live="polite">
      <template v-if="!error">
        <LoaderCircle class="mx-auto animate-spin" aria-hidden="true" />
        <h1>Finishing sign in</h1>
        <p>Securely preparing your account…</p>
      </template>
      <template v-else>
        <h1>Sign-in interrupted</h1>
        <p class="text-danger">{{ error }}</p>
        <RouterLink
          class="text-primary mt-4 inline-block font-semibold"
          to="/login"
          >Return to sign in</RouterLink
        >
      </template>
    </section>
  </main>
</template>
