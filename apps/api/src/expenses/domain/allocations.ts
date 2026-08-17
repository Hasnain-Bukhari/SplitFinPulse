import { FinancialDomainError } from "./financial-domain-error";
import { requirePositiveMinorUnits } from "./money";

export interface MoneyAllocation {
  userId: string;
  amountMinor: bigint;
}

export interface PayerInput {
  userId: string;
  amountMinor: string | bigint;
}

export interface SplitAllocation extends MoneyAllocation {
  inputValue: string | null;
}

export type SplitMethod = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";

export type SplitCalculationInput =
  | {
      method: "EQUAL";
      totalMinor: bigint;
      participantIds: readonly string[];
    }
  | {
      method: "EXACT" | "PERCENTAGE" | "SHARES";
      totalMinor: bigint;
      participants: ReadonlyArray<{ userId: string; value: string }>;
    };

interface WeightedParticipant {
  userId: string;
  normalizedValue: string;
  weight: bigint;
}

const DECIMAL_INPUT = /^(?:0|[1-9]\d*)(?:\.(\d{1,6}))?$/;
const DECIMAL_SCALE = 1_000_000n;
const ONE_HUNDRED_SCALED = 100n * DECIMAL_SCALE;

function compareIdentifiers(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPositiveTotal(totalMinor: bigint): void {
  if (totalMinor <= 0n) {
    throw new FinancialDomainError(
      "INVALID_SPLIT_INPUT",
      "Expense total must be greater than zero.",
    );
  }
}

function validateUniqueUsers(
  userIds: readonly string[],
  code: "INVALID_PARTICIPANT" | "INVALID_PAYER",
): void {
  if (userIds.length === 0) {
    throw new FinancialDomainError(code, "At least one user is required.");
  }

  const seen = new Set<string>();
  for (const userId of userIds) {
    if (userId.length === 0 || seen.has(userId)) {
      throw new FinancialDomainError(
        code,
        "User identifiers must be non-empty and unique.",
      );
    }
    seen.add(userId);
  }
}

function parsePositiveDecimal(value: string): {
  normalizedValue: string;
  scaled: bigint;
} {
  const match = DECIMAL_INPUT.exec(value);
  if (!match) {
    throw new FinancialDomainError(
      "INVALID_SPLIT_INPUT",
      "Split values must be canonical positive decimals with at most six fractional digits.",
    );
  }

  const [whole, fraction = ""] = value.split(".");
  const scaled =
    BigInt(whole!) * DECIMAL_SCALE + BigInt(fraction.padEnd(6, "0"));
  if (scaled === 0n) {
    throw new FinancialDomainError(
      "INVALID_SPLIT_INPUT",
      "Split values must be greater than zero.",
    );
  }

  const normalizedFraction = fraction.replace(/0+$/, "");
  return {
    normalizedValue: normalizedFraction
      ? `${whole}.${normalizedFraction}`
      : whole!,
    scaled,
  };
}

function allocateByWeight(
  totalMinor: bigint,
  participants: readonly WeightedParticipant[],
): SplitAllocation[] {
  const totalWeight = participants.reduce((sum, item) => sum + item.weight, 0n);
  const provisional = participants.map((participant) => {
    const numerator = totalMinor * participant.weight;
    return {
      ...participant,
      amountMinor: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  let unallocated =
    totalMinor - provisional.reduce((sum, item) => sum + item.amountMinor, 0n);

  const remainderOrder = [...provisional].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return compareIdentifiers(left.userId, right.userId);
  });
  for (const item of remainderOrder) {
    if (unallocated === 0n) break;
    item.amountMinor += 1n;
    unallocated -= 1n;
  }

  if (provisional.some((item) => item.amountMinor === 0n)) {
    throw new FinancialDomainError(
      "INVALID_SPLIT_INPUT",
      "Every selected participant must owe at least one minor unit.",
    );
  }

  return provisional
    .sort((left, right) => compareIdentifiers(left.userId, right.userId))
    .map(({ userId, amountMinor, normalizedValue }) => ({
      userId,
      amountMinor,
      inputValue: normalizedValue,
    }));
}

export function validatePayers(
  totalMinor: bigint,
  payers: readonly PayerInput[],
): MoneyAllocation[] {
  if (totalMinor <= 0n) {
    throw new FinancialDomainError(
      "INVALID_PAYER",
      "Expense total must be greater than zero.",
    );
  }
  validateUniqueUsers(
    payers.map((payer) => payer.userId),
    "INVALID_PAYER",
  );

  const normalized = payers
    .map(({ userId, amountMinor }) => ({
      userId,
      amountMinor: requirePositiveMinorUnits(amountMinor, "INVALID_PAYER"),
    }))
    .sort((left, right) => compareIdentifiers(left.userId, right.userId));

  if (
    normalized.reduce((sum, payer) => sum + payer.amountMinor, 0n) !==
    totalMinor
  ) {
    throw new FinancialDomainError(
      "PAYER_TOTAL_MISMATCH",
      "Payer allocations must equal the expense total.",
    );
  }
  return normalized;
}

export function calculateSplit(
  input: SplitCalculationInput,
): SplitAllocation[] {
  assertPositiveTotal(input.totalMinor);

  if (input.method === "EQUAL") {
    validateUniqueUsers(input.participantIds, "INVALID_PARTICIPANT");
    return allocateByWeight(
      input.totalMinor,
      input.participantIds.map((userId) => ({
        userId,
        normalizedValue: "1",
        weight: 1n,
      })),
    ).map((allocation) => ({ ...allocation, inputValue: null }));
  }

  validateUniqueUsers(
    input.participants.map((participant) => participant.userId),
    "INVALID_PARTICIPANT",
  );

  if (input.method === "EXACT") {
    const allocations = input.participants
      .map(({ userId, value }) => ({
        userId,
        amountMinor: requirePositiveMinorUnits(value),
        inputValue: value,
      }))
      .sort((left, right) => compareIdentifiers(left.userId, right.userId));
    if (
      allocations.reduce((sum, item) => sum + item.amountMinor, 0n) !==
      input.totalMinor
    ) {
      throw new FinancialDomainError(
        "SPLIT_TOTAL_MISMATCH",
        "Exact split allocations must equal the expense total.",
      );
    }
    return allocations;
  }

  const weighted = input.participants.map(({ userId, value }) => {
    const parsed = parsePositiveDecimal(value);
    return {
      userId,
      normalizedValue: parsed.normalizedValue,
      weight: parsed.scaled,
    };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0n);
  if (input.method === "PERCENTAGE" && totalWeight !== ONE_HUNDRED_SCALED) {
    throw new FinancialDomainError(
      "SPLIT_TOTAL_MISMATCH",
      "Percentage split values must total exactly 100.",
    );
  }

  return allocateByWeight(input.totalMinor, weighted);
}
