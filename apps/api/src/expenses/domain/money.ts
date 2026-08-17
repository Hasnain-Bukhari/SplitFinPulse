import { FinancialDomainError } from "./financial-domain-error";

export interface ParseMinorUnitsOptions {
  allowNegative?: boolean;
  allowZero?: boolean;
}

const CANONICAL_MINOR_UNITS = /^(?:0|-[1-9]\d*|[1-9]\d*)$/;

export function parseMinorUnits(
  value: string,
  options: ParseMinorUnitsOptions = {},
): bigint {
  if (!CANONICAL_MINOR_UNITS.test(value)) {
    throw new FinancialDomainError(
      "INVALID_MINOR_UNITS",
      "Minor units must be a canonical base-10 integer string.",
    );
  }

  const amount = BigInt(value);
  if (!options.allowNegative && amount < 0n) {
    throw new FinancialDomainError(
      "INVALID_MINOR_UNITS",
      "Minor units cannot be negative.",
    );
  }
  if (options.allowZero === false && amount === 0n) {
    throw new FinancialDomainError(
      "INVALID_MINOR_UNITS",
      "Minor units must be greater than zero.",
    );
  }

  return amount;
}

export function formatMinorUnits(value: bigint): string {
  return value.toString(10);
}

export function requirePositiveMinorUnits(
  value: string | bigint,
  code: "INVALID_PAYER" | "INVALID_SPLIT_INPUT" = "INVALID_SPLIT_INPUT",
): bigint {
  try {
    const amount =
      typeof value === "bigint"
        ? value
        : parseMinorUnits(value, { allowZero: false });
    if (amount <= 0n) {
      throw new FinancialDomainError(code, "Amount must be greater than zero.");
    }
    return amount;
  } catch (error) {
    if (error instanceof FinancialDomainError && error.code === code) {
      throw error;
    }
    throw new FinancialDomainError(
      code,
      "Amount must be a positive minor-unit value.",
    );
  }
}
