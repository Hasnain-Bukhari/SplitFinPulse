import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./receipt-ocr";

describe("receipt OCR suggestions", () => {
  it("extracts suggestions without converting the total into money", () => {
    expect(
      parseReceiptText(
        "Corner Market\nDate 2026/08/20\nSubtotal 1,200.00\nGrand total USD 1,234.50",
        87.24,
      ),
    ).toEqual({
      merchant: "Corner Market",
      expenseDate: "2026-08-20",
      totalText: "1234.50",
      currencyHint: "USD",
      confidence: "87.2",
    });
  });

  it("returns nullable suggestions for unstructured text", () => {
    const result = parseReceiptText("***", -10);
    expect(result).toMatchObject({
      merchant: null,
      expenseDate: null,
      totalText: null,
      currencyHint: null,
      confidence: "0.0",
    });
  });
});
