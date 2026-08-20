import { describe, expect, it } from "vitest";
import { parseExpenseQuery, serializeExpenseQuery } from "./expense-query";

describe("expense URL query codec", () => {
  it("normalizes supported filters and rejects invalid enums", () => {
    expect(
      parseExpenseQuery({
        q: "  dinner ",
        currency: "USD",
        settledState: "PARTIALLY_SETTLED",
        sort: "DATE_ASC",
        ignored: "value",
      }),
    ).toEqual({
      q: "dinner",
      currency: "USD",
      settledState: "PARTIALLY_SETTLED",
      sort: "DATE_ASC",
    });
    expect(
      parseExpenseQuery({
        currency: "usd",
        settledState: "DONE",
        sort: "RANDOM",
      }),
    ).toEqual({});
  });

  it("omits empty values for stable shareable URLs", () => {
    expect(
      serializeExpenseQuery({ q: "rent", categoryId: "", sort: "DATE_DESC" }),
    ).toEqual({ q: "rent", sort: "DATE_DESC" });
  });
});
