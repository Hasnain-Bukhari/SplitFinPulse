import type { MoneyAllocation } from "./allocations";
import { FinancialDomainError } from "./financial-domain-error";

export interface LedgerCalculationInput {
  payers: readonly MoneyAllocation[];
  splits: readonly MoneyAllocation[];
}

export interface LedgerTransfer {
  sequence: number;
  debtorId: string;
  creditorId: string;
  amountMinor: bigint;
}

export interface NetPosition {
  userId: string;
  netMinor: bigint;
}

function compareIdentifiers(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function aggregateAllocations(
  target: Map<string, bigint>,
  allocations: readonly MoneyAllocation[],
  multiplier: 1n | -1n,
): void {
  for (const allocation of allocations) {
    if (!allocation.userId || allocation.amountMinor <= 0n) {
      throw new FinancialDomainError(
        "INVALID_LEDGER_ENTRY",
        "Ledger allocations require a user and a positive amount.",
      );
    }
    target.set(
      allocation.userId,
      (target.get(allocation.userId) ?? 0n) +
        allocation.amountMinor * multiplier,
    );
  }
}

export function calculateAllocationNetPositions(
  input: LedgerCalculationInput,
): NetPosition[] {
  const payerTotal = input.payers.reduce(
    (sum, item) => sum + item.amountMinor,
    0n,
  );
  const splitTotal = input.splits.reduce(
    (sum, item) => sum + item.amountMinor,
    0n,
  );
  if (payerTotal !== splitTotal) {
    throw new FinancialDomainError(
      "INVALID_LEDGER_ENTRY",
      "Paid and owed allocations must conserve the same total.",
    );
  }

  const positions = new Map<string, bigint>();
  aggregateAllocations(positions, input.payers, 1n);
  aggregateAllocations(positions, input.splits, -1n);
  return [...positions]
    .filter(([, netMinor]) => netMinor !== 0n)
    .map(([userId, netMinor]) => ({ userId, netMinor }))
    .sort((left, right) => compareIdentifiers(left.userId, right.userId));
}

export function matchNetPositions(
  positions: readonly NetPosition[],
): LedgerTransfer[] {
  const total = positions.reduce((sum, item) => sum + item.netMinor, 0n);
  const uniqueUsers = new Set(positions.map((position) => position.userId));
  if (
    total !== 0n ||
    uniqueUsers.size !== positions.length ||
    positions.some((position) => !position.userId || position.netMinor === 0n)
  ) {
    throw new FinancialDomainError(
      "INVALID_LEDGER_ENTRY",
      "Net positions must be unique, non-zero, and sum to zero.",
    );
  }

  const byMagnitudeThenUser = (
    left: NetPosition,
    right: NetPosition,
  ): number => {
    const leftMagnitude = left.netMinor < 0n ? -left.netMinor : left.netMinor;
    const rightMagnitude =
      right.netMinor < 0n ? -right.netMinor : right.netMinor;
    if (leftMagnitude !== rightMagnitude)
      return leftMagnitude > rightMagnitude ? -1 : 1;
    return compareIdentifiers(left.userId, right.userId);
  };
  const debtors = positions
    .filter((position) => position.netMinor < 0n)
    .map((position) => ({ ...position }))
    .sort(byMagnitudeThenUser);
  const creditors = positions
    .filter((position) => position.netMinor > 0n)
    .map((position) => ({ ...position }))
    .sort(byMagnitudeThenUser);

  const transfers: LedgerTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!;
    const creditor = creditors[creditorIndex]!;
    const debt = -debtor.netMinor;
    const amountMinor = debt < creditor.netMinor ? debt : creditor.netMinor;
    transfers.push({
      sequence: transfers.length,
      debtorId: debtor.userId,
      creditorId: creditor.userId,
      amountMinor,
    });
    debtor.netMinor += amountMinor;
    creditor.netMinor -= amountMinor;
    if (debtor.netMinor === 0n) debtorIndex += 1;
    if (creditor.netMinor === 0n) creditorIndex += 1;
  }

  return transfers;
}

export function generateLedger(
  input: LedgerCalculationInput,
): LedgerTransfer[] {
  return matchNetPositions(calculateAllocationNetPositions(input));
}
