import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api/client";
import { formatMinor } from "./money";
import { sessionQueryOptions } from "@/lib/query-client";

export function useCurrencyFormatter(): {
  formatCurrency: (minor: string, currency: string) => string;
} {
  const options = useQuery({
    queryKey: ["profile", "options"],
    queryFn: api.profileOptions,
    staleTime: 5 * 60_000,
  });
  const session = useQuery(sessionQueryOptions);
  return {
    formatCurrency(minor, currency) {
      const metadata = options.data.value?.currencies.find(
        (item) => item.code === currency,
      );
      return metadata
        ? formatMinor(
            minor,
            currency,
            metadata.minorUnit,
            session.data.value?.user.locale ?? "en-US",
          )
        : `${currency} …`;
    },
  };
}
