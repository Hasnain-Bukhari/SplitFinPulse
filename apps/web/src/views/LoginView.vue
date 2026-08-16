<script setup lang="ts">
import { LogIn, ShieldCheck } from "@lucide/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import BrandMark from "@/components/BrandMark.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const route = useRoute();
const reason = computed(() =>
  route.query.reason === "account_deleted"
    ? "That account was permanently deleted and cannot be restored."
    : route.query.reason
      ? "Google sign-in could not be completed. Please try again."
      : "",
);
const returnTo = computed(() => {
  const value =
    typeof route.query.returnTo === "string" ? route.query.returnTo : "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
});

function signIn(): void {
  window.location.assign(api.googleLoginUrl(returnTo.value));
}
</script>

<template>
  <main id="main-content" class="auth-page">
    <div class="auth-topbar"><BrandMark /><ThemeToggle /></div>
    <section class="auth-card" aria-labelledby="login-title">
      <div class="auth-icon"><ShieldCheck aria-hidden="true" /></div>
      <p class="eyebrow">Secure account access</p>
      <h1 id="login-title">Welcome to SplitFinPulse</h1>
      <p>
        Sign in to keep your preferences and future shared expenses private and
        available across devices.
      </p>
      <p v-if="reason" class="form-error" role="alert">{{ reason }}</p>
      <Button class="mt-6 w-full" @click="signIn">
        <LogIn :size="19" aria-hidden="true" /> Continue with Google
      </Button>
      <p class="auth-footnote">
        Google verifies your identity. SplitFinPulse never stores your Google
        tokens.
      </p>
    </section>
  </main>
</template>
