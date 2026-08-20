import type { ExpenseListFilters } from "@/lib/api/client";
import type { LocationQuery } from "vue-router";

const string = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function parseExpenseQuery(query: LocationQuery): ExpenseListFilters {
  const result: ExpenseListFilters = {};
  const fields = [
    "q",
    "categoryId",
    "personId",
    "groupId",
    "friendshipId",
    "dateFrom",
    "dateTo",
    "cursor",
  ] as const;
  for (const field of fields) {
    const value = string(query[field]);
    if (value) result[field] = value;
  }
  const currency = string(query.currency);
  if (currency?.match(/^[A-Z]{3}$/)) result.currency = currency;
  const settled = string(query.settledState);
  const sort = string(query.sort);
  const status = string(query.status);
  if (status && ["ACTIVE", "DELETED"].includes(status))
    result.status = status as "ACTIVE" | "DELETED";
  if (settled && ["OPEN", "PARTIALLY_SETTLED", "SETTLED"].includes(settled))
    result.settledState = settled as "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";
  if (
    sort &&
    [
      "DATE_DESC",
      "DATE_ASC",
      "UPDATED_DESC",
      "AMOUNT_DESC",
      "AMOUNT_ASC",
    ].includes(sort)
  )
    result.sort = sort as
      "DATE_DESC" | "DATE_ASC" | "UPDATED_DESC" | "AMOUNT_DESC" | "AMOUNT_ASC";
  return result;
}

export function serializeExpenseQuery(filters: ExpenseListFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => Boolean(value)),
  );
}
