import { describe, expect, it } from "vitest";
import {
  addMinor,
  currencyMinorUnit,
  decimalToMinor,
  expenseCurrencyDefault,
  minorToDecimal,
} from "./money";

describe("money transport helpers", () => {
  it("converts decimal strings without Number arithmetic", () => {
    expect(decimalToMinor("12.34", 2)).toBe("1234");
    expect(decimalToMinor("12.3", 3)).toBe("12300");
    expect(decimalToMinor("12", 0)).toBe("12");
    expect(decimalToMinor("12.345", 2)).toBeNull();
    expect(decimalToMinor("01.00", 2)).toBeNull();
  });

  it("round trips values larger than Number.MAX_SAFE_INTEGER", () => {
    const value = "900719925474099312345";
    expect(decimalToMinor(minorToDecimal(value, 3), 3)).toBe(value);
  });

  it("supports signed display and exact bigint addition", () => {
    expect(minorToDecimal("-123", 2)).toBe("-1.23");
    expect(addMinor(["9007199254740993", "7"])).toBe("9007199254741000");
  });

  it("uses ISO common minor units", () => {
    expect(currencyMinorUnit("JPY")).toBe(0);
    expect(currencyMinorUnit("KWD")).toBe(3);
    expect(currencyMinorUnit("USD")).toBe(2);
  });

  it("adopts async context currency until the user overrides it", () => {
    expect(expenseCurrencyDefault("USD", "THB", false)).toBe("THB");
    expect(expenseCurrencyDefault("EUR", "THB", true)).toBe("EUR");
  });
});
