import { FinancialDomainError } from "./financial-domain-error";
import {
  matchNetPositions,
  type LedgerTransfer,
  type NetPosition,
} from "./ledger";

export interface CurrencyLedgerTransfer extends LedgerTransfer {
  currency: string;
}

export interface CurrencyNetPosition extends NetPosition {
  currency: string;
}

const ISO_CURRENCY = /^[A-Z]{3}$/;

function compareIdentifiers(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function calculateNetPositions(
  entries: readonly CurrencyLedgerTransfer[],
): CurrencyNetPosition[] {
  const positions = new Map<string, bigint>();
  for (const entry of entries) {
    if (
      !ISO_CURRENCY.test(entry.currency) ||
      !entry.debtorId ||
      !entry.creditorId ||
      entry.debtorId === entry.creditorId ||
      entry.amountMinor <= 0n
    ) {
      throw new FinancialDomainError(
        "INVALID_LEDGER_ENTRY",
        "Ledger entries require a currency, distinct users, and a positive amount.",
      );
    }
    const debtorKey = `${entry.currency}:${entry.debtorId}`;
    const creditorKey = `${entry.currency}:${entry.creditorId}`;
    positions.set(
      debtorKey,
      (positions.get(debtorKey) ?? 0n) - entry.amountMinor,
    );
    positions.set(
      creditorKey,
      (positions.get(creditorKey) ?? 0n) + entry.amountMinor,
    );
  }

  return [...positions]
    .filter(([, netMinor]) => netMinor !== 0n)
    .map(([key, netMinor]) => {
      const separator = key.indexOf(":");
      return {
        currency: key.slice(0, separator),
        userId: key.slice(separator + 1),
        netMinor,
      };
    })
    .sort(
      (left, right) =>
        compareIdentifiers(left.currency, right.currency) ||
        compareIdentifiers(left.userId, right.userId),
    );
}

export function simplifyDebts(
  entries: readonly CurrencyLedgerTransfer[],
): CurrencyLedgerTransfer[] {
  const positions = calculateNetPositions(entries);
  const currencies = [
    ...new Set(positions.map((position) => position.currency)),
  ].sort(compareIdentifiers);
  const simplified: CurrencyLedgerTransfer[] = [];

  for (const currency of currencies) {
    const transfers = matchNetPositions(
      positions
        .filter((position) => position.currency === currency)
        .map(({ userId, netMinor }) => ({ userId, netMinor })),
    );
    simplified.push(
      ...transfers.map((transfer) => ({
        ...transfer,
        sequence: simplified.length + transfer.sequence,
        currency,
      })),
    );
  }
  return simplified;
}
