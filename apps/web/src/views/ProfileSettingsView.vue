<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import { reactive, ref, watch } from "vue";
import SettingsNav from "@/components/SettingsNav.vue";
import { Button } from "@/components/ui/button";
import {
  api,
  type ChannelPreference,
  type UpdateProfileInput,
} from "@/lib/api/client";
import {
  queryClient,
  sessionQueryKey,
  sessionQueryOptions,
} from "@/lib/query-client";
import { enablePushNotifications } from "@/lib/push";

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
    budgetAlerts: true,
  },
});
const channelPreferences = ref<ChannelPreference[]>([]);
const pushStatus = ref("");
const channels = useQuery({
  queryKey: ["notifications", "preferences"],
  queryFn: api.notificationPreferences,
});
watch(
  () => channels.data.value?.preferences,
  (value) => {
    if (value) channelPreferences.value = value.map((item) => ({ ...item }));
  },
  { immediate: true },
);

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
  mutationFn: async () => {
    const [user] = await Promise.all([
      api.updateProfile({
        ...form,
        notificationPreferences: { ...form.notificationPreferences },
      }),
      api.updateNotificationPreferences(channelPreferences.value),
    ]);
    return user;
  },
  onSuccess: (user) => {
    queryClient.setQueryData(
      sessionQueryKey,
      (current: typeof session.data.value) =>
        current ? { ...current, user } : current,
    );
  },
});
async function enablePush(): Promise<void> {
  pushStatus.value = "Enabling push notifications…";
  try {
    await enablePushNotifications();
    pushStatus.value = "Push notifications enabled on this device.";
  } catch (error) {
    pushStatus.value =
      error instanceof Error
        ? error.message
        : "Push notifications could not be enabled.";
  }
}
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
          <legend>Notification preferences</legend>
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
          <label class="check-row"
            ><input
              v-model="form.notificationPreferences.budgetAlerts"
              type="checkbox"
            />
            Budget alerts</label
          >
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <label
              v-for="item in channelPreferences"
              :key="`${item.category}:${item.channel}`"
              class="check-row text-xs"
              ><input v-model="item.enabled" type="checkbox" />{{
                item.category.replaceAll("_", " ").toLowerCase()
              }}
              · {{ item.channel.toLowerCase() }}</label
            >
          </div>
          <small
            >Category switches disable every channel. Channel switches control
            in-app, push, or email delivery individually.</small
          >
          <div class="mt-3">
            <Button type="button" variant="outline" @click="enablePush"
              >Enable push on this device</Button
            >
            <p
              v-if="pushStatus"
              class="text-muted-foreground mt-2 text-xs"
              role="status"
            >
              {{ pushStatus }}
            </p>
          </div>
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
