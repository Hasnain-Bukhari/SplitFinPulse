<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { reactive } from "vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SettingsNav from "@/components/SettingsNav.vue";
import { api } from "@/lib/api/client";

const queryClient = useQueryClient();
const categories = useQuery({
  queryKey: ["categories", "all"],
  queryFn: () => api.categories(true),
});
const form = reactive({ name: "", icon: "tag" });
const create = useMutation({
  mutationFn: () => api.createCategory(form),
  onSuccess: async () => {
    form.name = "";
    form.icon = "tag";
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
  },
});
const archive = useMutation({
  mutationFn: (id: string) => api.archiveCategory(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
});
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <SettingsNav />
    <div>
      <p class="section-kicker">Organization</p>
      <h1 class="text-2xl font-bold">Categories</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        System categories are shared defaults. Your custom categories can be
        archived without changing expense history.
      </p>
    </div>
    <Card class="p-5"
      ><form
        class="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        @submit.prevent="create.mutate()"
      >
        <label>Name<input v-model="form.name" maxlength="80" required /></label
        ><label
          >Icon key<input
            v-model="form.icon"
            maxlength="40"
            pattern="[a-z0-9-]+"
            required /></label
        ><Button type="submit" :disabled="create.isPending.value"
          >Create</Button
        >
      </form></Card
    >
    <Card class="p-5"
      ><h2 class="font-bold">Available categories</h2>
      <ul class="mt-3 divide-y">
        <li
          v-for="item in categories.data.value?.items"
          :key="item.id"
          class="flex items-center justify-between gap-3 py-3"
        >
          <span
            ><strong>{{ item.name }}</strong
            ><small class="text-muted-foreground ml-2"
              >{{ item.kind.toLowerCase()
              }}<template v-if="item.archived"> · archived</template></small
            ></span
          ><Button
            v-if="item.canManage && !item.archived"
            size="sm"
            variant="outline"
            @click="archive.mutate(item.id)"
            >Archive</Button
          >
        </li>
      </ul></Card
    >
  </div>
</template>
