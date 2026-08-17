import { describe, expect, it } from "vitest";
import {
  calculateAllocationNetPositions,
  FinancialDomainError,
  generateLedger,
  matchNetPositions,
} from "./index";

describe("expense ledger generation", () => {
  it("nets payers against splits and emits auditable debtor-creditor transfers", () => {
    expect(
      generateLedger({
        payers: [{ userId: "a", amountMinor: 100n }],
        splits: [
          { userId: "a", amountMinor: 20n },
          { userId: "b", amountMinor: 30n },
          { userId: "c", amountMinor: 50n },
        ],
      }),
    ).toEqual([
      { sequence: 0, debtorId: "c", creditorId: "a", amountMinor: 50n },
      { sequence: 1, debtorId: "b", creditorId: "a", amountMinor: 30n },
    ]);
  });

  it("supports multiple payers independently of participants", () => {
    expect(
      generateLedger({
        payers: [
          { userId: "b", amountMinor: 40n },
          { userId: "a", amountMinor: 60n },
        ],
        splits: [
          { userId: "a", amountMinor: 25n },
          { userId: "b", amountMinor: 25n },
          { userId: "c", amountMinor: 50n },
        ],
      }),
    ).toEqual([
      { sequence: 0, debtorId: "c", creditorId: "a", amountMinor: 35n },
      { sequence: 1, debtorId: "c", creditorId: "b", amountMinor: 15n },
    ]);
  });

  it("is invariant to allocation input order", () => {
    const first = generateLedger({
      payers: [
        { userId: "a", amountMinor: 60n },
        { userId: "b", amountMinor: 40n },
      ],
      splits: [
        { userId: "a", amountMinor: 25n },
        { userId: "b", amountMinor: 25n },
        { userId: "c", amountMinor: 50n },
      ],
    });
    const shuffled = generateLedger({
      payers: [
        { userId: "b", amountMinor: 40n },
        { userId: "a", amountMinor: 60n },
      ],
      splits: [
        { userId: "c", amountMinor: 50n },
        { userId: "b", amountMinor: 25n },
        { userId: "a", amountMinor: 25n },
      ],
    });
    expect(shuffled).toEqual(first);
  });

  it("uses user identifier as the deterministic magnitude tie-breaker", () => {
    expect(
      matchNetPositions([
        { userId: "creditor-b", netMinor: 5n },
        { userId: "debtor-b", netMinor: -5n },
        { userId: "creditor-a", netMinor: 5n },
        { userId: "debtor-a", netMinor: -5n },
      ]),
    ).toEqual([
      {
        sequence: 0,
        debtorId: "debtor-a",
        creditorId: "creditor-a",
        amountMinor: 5n,
      },
      {
        sequence: 1,
        debtorId: "debtor-b",
        creditorId: "creditor-b",
        amountMinor: 5n,
      },
    ]);
  });

  it("cancels users who paid exactly what they owe", () => {
    expect(
      calculateAllocationNetPositions({
        payers: [{ userId: "a", amountMinor: 5n }],
        splits: [{ userId: "a", amountMinor: 5n }],
      }),
    ).toEqual([]);
    expect(
      generateLedger({
        payers: [{ userId: "a", amountMinor: 5n }],
        splits: [{ userId: "a", amountMinor: 5n }],
      }),
    ).toEqual([]);
  });

  it("rejects non-conserving, non-positive, and invalid net inputs", () => {
    expect(() =>
      generateLedger({
        payers: [{ userId: "a", amountMinor: 5n }],
        splits: [{ userId: "b", amountMinor: 4n }],
      }),
    ).toThrowError(FinancialDomainError);
    expect(() =>
      generateLedger({
        payers: [{ userId: "a", amountMinor: 0n }],
        splits: [{ userId: "a", amountMinor: 0n }],
      }),
    ).toThrowError(FinancialDomainError);
    expect(() =>
      matchNetPositions([{ userId: "a", netMinor: 1n }]),
    ).toThrowError(FinancialDomainError);
  });

  it("conserves every position across a broad deterministic matrix", () => {
    for (let size = 1; size <= 50; size += 1) {
      const positions = Array.from({ length: size * 2 }, (_, index) => ({
        userId: `user-${String(index).padStart(3, "0")}`,
        netMinor: index < size ? -BigInt(index + 1) : BigInt(index - size + 1),
      }));
      const transfers = matchNetPositions(positions.reverse());
      const rebuilt = new Map<string, bigint>();
      for (const transfer of transfers) {
        rebuilt.set(
          transfer.debtorId,
          (rebuilt.get(transfer.debtorId) ?? 0n) - transfer.amountMinor,
        );
        rebuilt.set(
          transfer.creditorId,
          (rebuilt.get(transfer.creditorId) ?? 0n) + transfer.amountMinor,
        );
        expect(transfer.debtorId).not.toBe(transfer.creditorId);
        expect(transfer.amountMinor).toBeGreaterThan(0n);
      }
      for (const position of positions) {
        expect(rebuilt.get(position.userId)).toBe(position.netMinor);
      }
    }
  });
});
