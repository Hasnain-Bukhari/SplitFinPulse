<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const error = ref("");
async function reactivate(): Promise<void> {
  error.value = "";
  try {
    const result = await api.reactivate();
    window.location.assign(result.authorizationUrl);
  } catch {
    error.value = "Account reactivation could not be started.";
  }
}
</script>

<template>
  <main id="main-content" class="auth-page">
    <section class="auth-card">
      <h1>Reactivate your account</h1>
      <p>
        Verify the same Google identity to restore access. Deleted accounts
        cannot be reactivated.
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <Button class="mt-5 w-full" @click="reactivate"
        >Verify with Google</Button
      >
    </section>
  </main>
</template>
