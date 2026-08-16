import { QueryClient } from "@tanstack/vue-query";
import { api } from "./api/client";

export const sessionQueryKey = ["auth", "session"] as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000 },
  },
});

export const sessionQueryOptions = {
  queryKey: sessionQueryKey,
  queryFn: api.session,
  staleTime: 30_000,
};
