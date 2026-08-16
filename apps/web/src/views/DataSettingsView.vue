<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import SettingsNav from "@/components/SettingsNav.vue";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

const router = useRouter();
const message = ref("");
const confirmation = ref("");

async function withReauthentication(
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof ApiError && error.code === "REAUTH_REQUIRED") {
      const result = await api.reauthenticate();
      window.location.assign(result.authorizationUrl);
      return;
    }
    message.value = "The account operation could not be completed.";
  }
}

function exportAccount(): void {
  void withReauthentication(async () => {
    const blob = await api.exportAccount();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "splitfinpulse-account.json";
    anchor.click();
    URL.revokeObjectURL(url);
    message.value = "Your account export has been downloaded.";
  });
}

async function deactivate(): Promise<void> {
  await api.deactivate();
  queryClient.clear();
  await router.replace("/account/reactivate");
}

function deleteAccount(): void {
  if (confirmation.value !== "DELETE") return;
  void withReauthentication(async () => {
    await api.deleteAccount();
    queryClient.clear();
    await router.replace("/login");
  });
}
</script>

<template>
  <div class="settings-layout">
    <SettingsNav />
    <section class="settings-panel" aria-labelledby="data-heading">
      <h2 id="data-heading">Account data</h2>
      <p v-if="message" role="status">{{ message }}</p>
      <article class="data-action">
        <div>
          <h3>Download your data</h3>
          <p>
            Export your profile, identity, session, and account-lifecycle
            information as JSON.
          </p>
        </div>
        <Button variant="outline" @click="exportAccount"
          >Download export</Button
        >
      </article>
      <article class="data-action">
        <div>
          <h3>Deactivate account</h3>
          <p>
            Sign out every device and pause access. You can reactivate with the
            same Google identity.
          </p>
        </div>
        <Button variant="outline" @click="deactivate">Deactivate</Button>
      </article>
      <article class="data-action data-action--danger">
        <div>
          <h3>Delete account permanently</h3>
          <p>
            Personal identity data is removed, while future shared financial
            history must retain an anonymous participant record.
          </p>
          <label
            >Type DELETE to confirm<input
              v-model="confirmation"
              autocomplete="off"
          /></label>
        </div>
        <Button :disabled="confirmation !== 'DELETE'" @click="deleteAccount"
          >Delete permanently</Button
        >
      </article>
    </section>
  </div>
</template>
