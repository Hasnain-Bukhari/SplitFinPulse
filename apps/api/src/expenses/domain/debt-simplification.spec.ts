import { describe, expect, it } from "vitest";
import {
  calculateNetPositions,
  FinancialDomainError,
  simplifyDebts,
  type CurrencyLedgerTransfer,
} from "./index";

function positions(
  entries: readonly CurrencyLedgerTransfer[],
): Map<string, bigint> {
  return new Map(
    calculateNetPositions(entries).map((position) => [
      `${position.currency}:${position.userId}`,
      position.netMinor,
    ]),
  );
}

describe("debt simplification", () => {
  it("removes cycles while preserving every member net position", () => {
    const raw: CurrencyLedgerTransfer[] = [
      {
        currency: "USD",
        sequence: 0,
        debtorId: "a",
        creditorId: "b",
        amountMinor: 10n,
      },
      {
        currency: "USD",
        sequence: 1,
        debtorId: "b",
        creditorId: "c",
        amountMinor: 10n,
      },
    ];
    const snapshot = structuredClone(raw);
    const simplified = simplifyDebts(raw);

    expect(simplified).toEqual([
      {
        currency: "USD",
        sequence: 0,
        debtorId: "a",
        creditorId: "c",
        amountMinor: 10n,
      },
    ]);
    expect(positions(simplified)).toEqual(positions(raw));
    expect(raw).toEqual(snapshot);
  });

  it("isolates currencies and orders the result deterministically", () => {
    const entries: CurrencyLedgerTransfer[] = [
      {
        currency: "USD",
        sequence: 9,
        debtorId: "b",
        creditorId: "c",
        amountMinor: 4n,
      },
      {
        currency: "EUR",
        sequence: 4,
        debtorId: "a",
        creditorId: "b",
        amountMinor: 7n,
      },
      {
        currency: "USD",
        sequence: 2,
        debtorId: "a",
        creditorId: "b",
        amountMinor: 4n,
      },
    ];
    expect(simplifyDebts(entries)).toEqual([
      {
        currency: "EUR",
        sequence: 0,
        debtorId: "a",
        creditorId: "b",
        amountMinor: 7n,
      },
      {
        currency: "USD",
        sequence: 1,
        debtorId: "a",
        creditorId: "c",
        amountMinor: 4n,
      },
    ]);
  });

  it("handles disconnected obligations and exact cancellations", () => {
    const entries: CurrencyLedgerTransfer[] = [
      {
        currency: "USD",
        sequence: 0,
        debtorId: "a",
        creditorId: "b",
        amountMinor: 5n,
      },
      {
        currency: "USD",
        sequence: 1,
        debtorId: "b",
        creditorId: "a",
        amountMinor: 5n,
      },
      {
        currency: "USD",
        sequence: 2,
        debtorId: "c",
        creditorId: "d",
        amountMinor: 9n,
      },
    ];
    expect(simplifyDebts(entries)).toEqual([
      {
        currency: "USD",
        sequence: 0,
        debtorId: "c",
        creditorId: "d",
        amountMinor: 9n,
      },
    ]);
  });

  it("rejects invalid currencies, self-transfers, and non-positive amounts", () => {
    const base = {
      sequence: 0,
      debtorId: "a",
      creditorId: "b",
      amountMinor: 1n,
    };
    expect(() => simplifyDebts([{ ...base, currency: "usd" }])).toThrowError(
      FinancialDomainError,
    );
    expect(() =>
      simplifyDebts([{ ...base, currency: "USD", creditorId: "a" }]),
    ).toThrowError(FinancialDomainError);
    expect(() =>
      simplifyDebts([{ ...base, currency: "USD", amountMinor: 0n }]),
    ).toThrowError(FinancialDomainError);
  });

  it("preserves all positions for many generated multi-currency graphs", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const raw: CurrencyLedgerTransfer[] = [];
      for (const currency of ["EUR", "USD"]) {
        for (let index = 0; index < 20; index += 1) {
          const debtor = (seed * 13 + index * 7) % 11;
          let creditor = (seed * 17 + index * 5 + 1) % 11;
          if (creditor === debtor) creditor = (creditor + 1) % 11;
          raw.push({
            currency,
            sequence: raw.length,
            debtorId: `user-${debtor}`,
            creditorId: `user-${creditor}`,
            amountMinor: BigInt(((seed + index * 19) % 1000) + 1),
          });
        }
      }
      const simplified = simplifyDebts(raw);
      expect(positions(simplified)).toEqual(positions(raw));
      expect(simplified.every((entry) => entry.amountMinor > 0n)).toBe(true);
    }
  });
});
