import { describe, expect, it } from "vitest";
import { CurrenciesService } from "./currencies.service";

describe("currency conversion", () => {
  const service = new CurrenciesService({} as never);

  it("converts exact rational rates across 0, 2, and 3 minor units", () => {
    expect(service.convert(100n, 110n, 1n, 2, 0)).toBe(110n);
    expect(service.convert(1_000n, 123_456n, 100_000n, 3, 2)).toBe(123n);
  });

  it("uses half-even rounding without floating point", () => {
    expect(service.convert(1n, 1n, 2n, 0, 0)).toBe(0n);
    expect(service.convert(3n, 1n, 2n, 0, 0)).toBe(2n);
    expect(service.convert(9_007_199_254_740_993n, 3n, 2n, 0, 0)).toBe(
      13_510_798_882_111_490n,
    );
  });
});
