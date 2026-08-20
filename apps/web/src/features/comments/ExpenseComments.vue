<script setup lang="ts">
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  api,
  ApiError,
  type ExpenseComment,
  type ExpenseCommentPage,
} from "@/lib/api/client";

const props = defineProps<{ expenseId: string; writable: boolean }>();
const queryClient = useQueryClient();
const body = ref("");
const editingId = ref<string>();
const editingBody = ref("");
const localError = ref("");
const queryKey = computed(
  () => ["expenses", props.expenseId, "comments"] as const,
);
const result = useInfiniteQuery(
  computed(() => ({
    queryKey: queryKey.value,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.expenseComments(props.expenseId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ExpenseCommentPage) =>
      page.nextCursor ?? undefined,
  })),
);
const items = computed(() =>
  [...(result.data.value?.pages.flatMap((page) => page.items) ?? [])].reverse(),
);

async function refresh(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKey.value }),
    queryClient.invalidateQueries({ queryKey: ["activities"] }),
  ]);
}
function message(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The comment could not be saved.";
}
const create = useMutation({
  mutationFn: () =>
    api.createExpenseComment(props.expenseId, body.value.trim()),
  onSuccess: async () => {
    body.value = "";
    localError.value = "";
    await refresh();
  },
  onError: (error) => (localError.value = message(error)),
});
const update = useMutation({
  mutationFn: (comment: ExpenseComment) =>
    api.updateExpenseComment(
      props.expenseId,
      comment.id,
      editingBody.value.trim(),
      comment.version,
    ),
  onSuccess: async () => {
    editingId.value = undefined;
    editingBody.value = "";
    localError.value = "";
    await refresh();
  },
  onError: (error) => (localError.value = message(error)),
});
const remove = useMutation({
  mutationFn: (comment: ExpenseComment) =>
    api.deleteExpenseComment(props.expenseId, comment.id, comment.version),
  onSuccess: refresh,
  onError: (error) => (localError.value = message(error)),
});
function submit(): void {
  localError.value = "";
  if (!body.value.trim()) {
    localError.value = "Enter a comment.";
    return;
  }
  create.mutate();
}
function startEdit(comment: ExpenseComment): void {
  editingId.value = comment.id;
  editingBody.value = comment.body ?? "";
}
function deleteComment(comment: ExpenseComment): void {
  if (window.confirm("Delete this comment?")) remove.mutate(comment);
}
</script>

<template>
  <div>
    <form v-if="writable" class="form-grid mt-0" @submit.prevent="submit">
      <label for="new-comment">Add a comment</label>
      <textarea
        id="new-comment"
        v-model="body"
        maxlength="2000"
        rows="3"
        placeholder="Write a comment…"
      />
      <div class="flex justify-end">
        <Button :disabled="create.isPending.value">{{
          create.isPending.value ? "Posting…" : "Post comment"
        }}</Button>
      </div>
    </form>
    <p v-if="localError" class="form-error mt-3" role="alert">
      {{ localError }}
    </p>
    <p
      v-if="result.isPending.value"
      class="text-muted-foreground mt-4 text-sm"
      role="status"
    >
      Loading comments…
    </p>
    <p
      v-else-if="result.isError.value"
      class="form-error mt-4 text-sm"
      role="alert"
    >
      Comments could not be loaded.
    </p>
    <p v-else-if="!items.length" class="text-muted-foreground mt-4 text-sm">
      No comments yet.
    </p>
    <ol v-else class="mt-4 divide-y" aria-label="Expense comments">
      <li v-for="comment in items" :key="comment.id" class="py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <strong class="text-sm">{{ comment.author.name }}</strong>
            <time
              :datetime="comment.createdAt"
              class="text-muted-foreground ml-2 text-xs"
              >{{ new Date(comment.createdAt).toLocaleString() }}</time
            >
            <span
              v-if="
                comment.updatedAt !== comment.createdAt && !comment.deletedAt
              "
              class="text-muted-foreground ml-2 text-xs"
              >edited</span
            >
          </div>
          <div
            v-if="
              (comment.permissions.canEdit || comment.permissions.canDelete) &&
              !comment.deletedAt
            "
            class="flex gap-1"
          >
            <Button
              v-if="comment.permissions.canEdit"
              size="sm"
              variant="ghost"
              @click="startEdit(comment)"
              >Edit</Button
            >
            <Button
              v-if="comment.permissions.canDelete"
              size="sm"
              variant="ghost"
              :disabled="remove.isPending.value"
              @click="deleteComment(comment)"
              >Delete</Button
            >
          </div>
        </div>
        <form
          v-if="editingId === comment.id"
          class="form-grid mt-3"
          @submit.prevent="update.mutate(comment)"
        >
          <label :for="`edit-comment-${comment.id}`">Edit comment</label>
          <textarea
            :id="`edit-comment-${comment.id}`"
            v-model="editingBody"
            maxlength="2000"
            rows="3"
          />
          <div class="flex justify-end gap-2">
            <Button type="button" variant="ghost" @click="editingId = undefined"
              >Cancel</Button
            >
            <Button :disabled="!editingBody.trim() || update.isPending.value"
              >Save</Button
            >
          </div>
        </form>
        <p
          v-else-if="comment.deletedAt"
          class="text-muted-foreground mt-2 text-sm italic"
        >
          Comment deleted
        </p>
        <p v-else class="mt-2 whitespace-pre-wrap text-sm">
          {{ comment.body }}
        </p>
      </li>
    </ol>
    <Button
      v-if="result.hasNextPage.value"
      class="mt-3"
      size="sm"
      variant="ghost"
      :disabled="result.isFetchingNextPage.value"
      @click="result.fetchNextPage()"
      >Load older comments</Button
    >
  </div>
</template>
