export type FinancialDomainErrorCode =
  | "INVALID_MINOR_UNITS"
  | "INVALID_PARTICIPANT"
  | "INVALID_PAYER"
  | "INVALID_SPLIT_INPUT"
  | "PAYER_TOTAL_MISMATCH"
  | "SPLIT_TOTAL_MISMATCH"
  | "INVALID_LEDGER_ENTRY";

export class FinancialDomainError extends Error {
  constructor(
    readonly code: FinancialDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FinancialDomainError";
  }
}
