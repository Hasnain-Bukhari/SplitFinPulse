<script setup lang="ts">
import { useMutation, useQuery } from "@tanstack/vue-query";
import { UsersRound } from "@lucide/vue";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Card } from "@/components/ui/card";
import GroupForm from "@/features/groups/GroupForm.vue";
import { api, ApiError, type CreateGroupInput } from "@/lib/api/client";
import { queryClient, sessionQueryOptions } from "@/lib/query-client";

const router = useRouter();
const error = ref("");
const session = useQuery(sessionQueryOptions);
const preferences = useQuery({
  queryKey: ["profile", "preference-options"],
  queryFn: api.profileOptions,
  staleTime: Infinity,
});
const create = useMutation({
  mutationFn: api.createGroup,
  onSuccess: async (group) => {
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    await router.push(`/groups/${group.id}`);
  },
  onError: (reason) => {
    error.value =
      reason instanceof ApiError
        ? reason.message
        : "The group could not be created.";
  },
});

function submit(input: CreateGroupInput): void {
  error.value = "";
  create.mutate(input);
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <Card class="p-5 sm:p-7">
      <span class="empty-state-icon"
        ><UsersRound :size="24" aria-hidden="true"
      /></span>
      <p class="section-kicker mt-4">New shared space</p>
      <h2 class="mt-1 text-2xl font-bold">Create a group</h2>
      <p class="text-muted-foreground mt-2 text-sm">
        Set the basics now. You can invite people after the group is created.
      </p>
      <GroupForm
        :initial="{
          name: '',
          type: 'OTHER',
          defaultCurrency: session.data.value?.user.defaultCurrency ?? 'USD',
          simplifyDebtsEnabled: false,
        }"
        :currencies="preferences.data.value?.currencies ?? []"
        :pending="create.isPending.value"
        :error="error"
        @submit="submit"
      />
    </Card>
  </div>
</template>
