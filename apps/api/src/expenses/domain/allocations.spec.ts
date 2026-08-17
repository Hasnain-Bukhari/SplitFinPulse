import { describe, expect, it } from "vitest";
import {
  calculateSplit,
  FinancialDomainError,
  formatMinorUnits,
  parseMinorUnits,
  validatePayers,
} from "./index";

function expectErrorCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("Expected action to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancialDomainError);
    expect((error as FinancialDomainError).code).toBe(code);
  }
}

describe("minor-unit values", () => {
  it("parses arbitrary-size canonical integer strings without precision loss", () => {
    const value = "999999999999999999999999999999999999";
    expect(parseMinorUnits(value)).toBe(BigInt(value));
    expect(formatMinorUnits(BigInt(value))).toBe(value);
    expect(parseMinorUnits("-42", { allowNegative: true })).toBe(-42n);
  });

  it.each(["", "00", "01", "+1", "-0", " 1", "1.0", "1e3"])(
    "rejects non-canonical value %j",
    (value) =>
      expectErrorCode(() => parseMinorUnits(value), "INVALID_MINOR_UNITS"),
  );

  it("rejects negative and optionally zero values", () => {
    expectErrorCode(() => parseMinorUnits("-1"), "INVALID_MINOR_UNITS");
    expectErrorCode(
      () => parseMinorUnits("0", { allowZero: false }),
      "INVALID_MINOR_UNITS",
    );
  });
});

describe("payer conservation", () => {
  it("normalizes payer order and conserves an arbitrary-size total", () => {
    const total = 10n ** 40n;
    expect(
      validatePayers(total, [
        { userId: "b", amountMinor: total - 1n },
        { userId: "a", amountMinor: "1" },
      ]),
    ).toEqual([
      { userId: "a", amountMinor: 1n },
      { userId: "b", amountMinor: total - 1n },
    ]);
  });

  it("rejects duplicate, non-positive, and non-conserving payer inputs", () => {
    expectErrorCode(
      () =>
        validatePayers(2n, [
          { userId: "a", amountMinor: "1" },
          { userId: "a", amountMinor: "1" },
        ]),
      "INVALID_PAYER",
    );
    expectErrorCode(
      () => validatePayers(1n, [{ userId: "a", amountMinor: "0" }]),
      "INVALID_PAYER",
    );
    expectErrorCode(
      () => validatePayers(2n, [{ userId: "a", amountMinor: "1" }]),
      "PAYER_TOTAL_MISMATCH",
    );
  });
});

describe("split allocation", () => {
  it("assigns equal-split remainder units by ascending user identifier", () => {
    expect(
      calculateSplit({
        method: "EQUAL",
        totalMinor: 10n,
        participantIds: ["c", "a", "b"],
      }),
    ).toEqual([
      { userId: "a", amountMinor: 4n, inputValue: null },
      { userId: "b", amountMinor: 3n, inputValue: null },
      { userId: "c", amountMinor: 3n, inputValue: null },
    ]);
  });

  it("accepts exact allocations only when they conserve the total", () => {
    expect(
      calculateSplit({
        method: "EXACT",
        totalMinor: 100n,
        participants: [
          { userId: "b", value: "75" },
          { userId: "a", value: "25" },
        ],
      }),
    ).toEqual([
      { userId: "a", amountMinor: 25n, inputValue: "25" },
      { userId: "b", amountMinor: 75n, inputValue: "75" },
    ]);
    expectErrorCode(
      () =>
        calculateSplit({
          method: "EXACT",
          totalMinor: 100n,
          participants: [{ userId: "a", value: "99" }],
        }),
      "SPLIT_TOTAL_MISMATCH",
    );
  });

  it("uses largest remainders and UUID ties for percentage splits", () => {
    expect(
      calculateSplit({
        method: "PERCENTAGE",
        totalMinor: 3n,
        participants: [
          { userId: "b", value: "50.000000" },
          { userId: "a", value: "50" },
        ],
      }),
    ).toEqual([
      { userId: "a", amountMinor: 2n, inputValue: "50" },
      { userId: "b", amountMinor: 1n, inputValue: "50" },
    ]);
  });

  it("allocates shares proportionally and deterministically", () => {
    expect(
      calculateSplit({
        method: "SHARES",
        totalMinor: 5n,
        participants: [
          { userId: "c", value: "1.000" },
          { userId: "b", value: "1" },
          { userId: "a", value: "1.0" },
        ],
      }),
    ).toEqual([
      { userId: "a", amountMinor: 2n, inputValue: "1" },
      { userId: "b", amountMinor: 2n, inputValue: "1" },
      { userId: "c", amountMinor: 1n, inputValue: "1" },
    ]);
  });

  it("rejects malformed weighted values and percentages not totaling 100", () => {
    for (const value of ["0", "01", ".5", "1.", "1.0000001", "-1", " 1"]) {
      expectErrorCode(
        () =>
          calculateSplit({
            method: "SHARES",
            totalMinor: 10n,
            participants: [{ userId: "a", value }],
          }),
        "INVALID_SPLIT_INPUT",
      );
    }
    expectErrorCode(
      () =>
        calculateSplit({
          method: "PERCENTAGE",
          totalMinor: 10n,
          participants: [{ userId: "a", value: "99.999999" }],
        }),
      "SPLIT_TOTAL_MISMATCH",
    );
  });

  it("rejects duplicates and allocations that round a participant to zero", () => {
    expectErrorCode(
      () =>
        calculateSplit({
          method: "EQUAL",
          totalMinor: 2n,
          participantIds: ["a", "a"],
        }),
      "INVALID_PARTICIPANT",
    );
    expectErrorCode(
      () =>
        calculateSplit({
          method: "SHARES",
          totalMinor: 2n,
          participants: [
            { userId: "a", value: "999999" },
            { userId: "b", value: "1" },
          ],
        }),
      "INVALID_SPLIT_INPUT",
    );
  });

  it("conserves money across a broad deterministic input matrix", () => {
    for (
      let participantCount = 1;
      participantCount <= 25;
      participantCount += 1
    ) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const totalMinor = BigInt(participantCount * 10_000 + seed * 97);
        const participantIds = Array.from(
          { length: participantCount },
          (_, index) =>
            `user-${String(participantCount - index).padStart(2, "0")}`,
        );
        const equal = calculateSplit({
          method: "EQUAL",
          totalMinor,
          participantIds,
        });
        const shares = calculateSplit({
          method: "SHARES",
          totalMinor,
          participants: participantIds.map((userId, index) => ({
            userId,
            value: String(((seed * 31 + index * 17) % 100) + 1),
          })),
        });
        expect(equal.reduce((sum, item) => sum + item.amountMinor, 0n)).toBe(
          totalMinor,
        );
        expect(shares.reduce((sum, item) => sum + item.amountMinor, 0n)).toBe(
          totalMinor,
        );
        expect(equal.every((item) => item.amountMinor > 0n)).toBe(true);
        expect(shares.every((item) => item.amountMinor > 0n)).toBe(true);
      }
    }
  });
});
