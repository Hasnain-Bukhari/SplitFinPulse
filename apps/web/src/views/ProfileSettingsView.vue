<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import { reactive, watch } from "vue";
import SettingsNav from "@/components/SettingsNav.vue";
import { Button } from "@/components/ui/button";
import { api, type UpdateProfileInput } from "@/lib/api/client";
import {
  queryClient,
  sessionQueryKey,
  sessionQueryOptions,
} from "@/lib/query-client";

const session = useQuery(sessionQueryOptions);
const options = useQuery({
  queryKey: ["account", "preference-options"],
  queryFn: api.profileOptions,
});
const form = reactive<UpdateProfileInput>({
  name: "",
  avatarVisible: true,
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en-US",
  notificationPreferences: {
    expenseActivity: true,
    reminders: true,
    invitations: true,
  },
});

watch(
  () => session.data.value?.user,
  (user) => {
    if (!user) return;
    Object.assign(form, {
      name: user.name,
      avatarVisible: Boolean(user.avatarUrl),
      defaultCurrency: user.defaultCurrency,
      timezone: user.timezone,
      locale: user.locale,
      notificationPreferences: { ...user.notificationPreferences },
    });
  },
  { immediate: true },
);

const save = useMutation({
  mutationFn: () =>
    api.updateProfile({
      ...form,
      notificationPreferences: { ...form.notificationPreferences },
    }),
  onSuccess: (user) => {
    queryClient.setQueryData(
      sessionQueryKey,
      (current: typeof session.data.value) =>
        current ? { ...current, user } : current,
    );
  },
});
</script>

<template>
  <div class="settings-layout">
    <SettingsNav />
    <section class="settings-panel" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Profile and preferences</h2>
      <p>These defaults shape formatting now and future expense creation.</p>
      <form class="form-grid" @submit.prevent="save.mutate()">
        <label
          >Display name<input
            v-model.trim="form.name"
            required
            maxlength="100"
            autocomplete="name"
        /></label>
        <label
          >Email<input
            :value="session.data.value?.user.email ?? ''"
            disabled
            autocomplete="email"
        /></label>
        <label class="check-row"
          ><input v-model="form.avatarVisible" type="checkbox" /> Show my Google
          profile image</label
        >
        <label
          >Default currency<select v-model="form.defaultCurrency">
            <option
              v-for="currency in options.data.value?.currencies"
              :key="currency.code"
              :value="currency.code"
            >
              {{ currency.code }} — {{ currency.name }}
            </option>
          </select></label
        >
        <label
          >Timezone<select v-model="form.timezone">
            <option
              v-for="timezone in options.data.value?.timezones"
              :key="timezone"
            >
              {{ timezone }}
            </option>
          </select></label
        >
        <label
          >Formatting locale<select v-model="form.locale">
            <option
              v-for="locale in options.data.value?.locales"
              :key="locale.code"
              :value="locale.code"
            >
              {{ locale.code }} — {{ locale.name }}
            </option>
          </select></label
        >
        <fieldset>
          <legend>Future notification preferences</legend>
          <label class="check-row"
            ><input
              v-model="form.notificationPreferences.expenseActivity"
              type="checkbox"
            />
            Expense activity</label
          >
          <label class="check-row"
            ><input
              v-model="form.notificationPreferences.reminders"
              type="checkbox"
            />
            Reminders</label
          >
          <label class="check-row"
            ><input
              v-model="form.notificationPreferences.invitations"
              type="checkbox"
            />
            Friend and group invitations</label
          >
          <small
            >Delivery is not enabled yet; these choices will be honored when it
            is.</small
          >
        </fieldset>
        <p v-if="save.isSuccess.value" class="form-success" role="status">
          Preferences saved.
        </p>
        <p v-if="save.isError.value" class="form-error" role="alert">
          Preferences could not be saved.
        </p>
        <Button type="submit" :disabled="save.isPending.value">{{
          save.isPending.value ? "Saving…" : "Save changes"
        }}</Button>
      </form>
    </section>
  </div>
</template>
