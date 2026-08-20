import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  ExpenseRevisionAction,
  ExpenseStatus,
  SplitMethod,
} from "../generated/prisma/client";

export class FinancialUserDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!:
    string | null;
}

export class PayerAllocationResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) userId!: string;
  @ApiProperty({ type: FinancialUserDto }) user!: FinancialUserDto;
  @ApiProperty({ type: String, example: "1250" }) amountMinor!: string;
}

export class SplitAllocationResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) userId!: string;
  @ApiProperty({ type: FinancialUserDto }) user!: FinancialUserDto;
  @ApiProperty({ type: String, example: "1250" }) owedMinor!: string;
  @ApiPropertyOptional({ type: String }) input?: string;
}

export class LedgerEntryResponseDto {
  @ApiProperty({ type: Number }) sequence!: number;
  @ApiProperty({ type: String, format: "uuid" }) debtorId!: string;
  @ApiProperty({ type: FinancialUserDto }) debtor!: FinancialUserDto;
  @ApiProperty({ type: String, format: "uuid" }) creditorId!: string;
  @ApiProperty({ type: FinancialUserDto }) creditor!: FinancialUserDto;
  @ApiProperty({ type: String, example: "1250" }) amountMinor!: string;
  @ApiProperty({ type: String, example: "USD" }) currency!: string;
}

export class CategorySnapshotResponseDto {
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  id!: string | null;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) icon!: string | null;
}

export class ExpenseSettlementResponseDto {
  @ApiProperty({ enum: ["OPEN", "PARTIALLY_SETTLED", "SETTLED"] })
  state!: "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";
  @ApiProperty({ type: String }) allocatedMinor!: string;
  @ApiProperty({ type: String }) remainingMinor!: string;
  @ApiPropertyOptional({ type: "array", items: { type: "object" } })
  obligations?: Array<Record<string, unknown>>;
  @ApiPropertyOptional({ type: "array", items: { type: "object" } })
  resolvingSettlements?: Array<Record<string, unknown>>;
}

export class ExchangeRateQuoteResponseDto {
  @ApiProperty({ type: String }) quoteCurrency!: string;
  @ApiProperty({ type: String }) numerator!: string;
  @ApiProperty({ type: String }) denominator!: string;
}

export class ValuationSnapshotResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) baseCurrency!: string;
  @ApiProperty({ enum: ["AVAILABLE", "MANUAL", "UNAVAILABLE"] })
  status!: "AVAILABLE" | "MANUAL" | "UNAVAILABLE";
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({ type: String, format: "date" }) effectiveDate!: string;
  @ApiProperty({ type: String, format: "date-time" }) capturedAt!: Date;
  @ApiProperty({ type: [ExchangeRateQuoteResponseDto] })
  quotes!: ExchangeRateQuoteResponseDto[];
}

export class ExpensePreviewResponseDto {
  @ApiProperty({ type: String, example: "2500" }) totalMinor!: string;
  @ApiProperty({ type: String, example: "USD" }) currency!: string;
  @ApiProperty({ type: [PayerAllocationResponseDto] })
  payers!: PayerAllocationResponseDto[];
  @ApiProperty({ type: [SplitAllocationResponseDto] })
  splits!: SplitAllocationResponseDto[];
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  ledgerEntries!: LedgerEntryResponseDto[];
}

export class ExpenseSummaryResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String, example: "2500" }) totalMinor!: string;
  @ApiProperty({ type: String, example: "USD" }) currency!: string;
  @ApiProperty({ type: String, example: "2026-08-17" }) expenseDate!: string;
  @ApiProperty({ enum: ExpenseStatus }) status!: ExpenseStatus;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  groupId!: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  friendshipId!: string | null;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => CategorySnapshotResponseDto,
    nullable: true,
  })
  category!: CategorySnapshotResponseDto | null;
  @ApiProperty({ type: () => ExpenseSettlementResponseDto })
  settlement!: ExpenseSettlementResponseDto;
}

export class ExpensePermissionsResponseDto {
  @ApiProperty({ type: Boolean }) canEdit!: boolean;
  @ApiProperty({ type: Boolean }) canDelete!: boolean;
  @ApiProperty({ type: Boolean }) canRestore!: boolean;
}

export class ExpenseDetailResponseDto extends ExpenseSummaryResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: FinancialUserDto }) creator!: FinancialUserDto;
  @ApiProperty({ enum: SplitMethod }) splitMethod!: SplitMethod;
  @ApiProperty({ type: [PayerAllocationResponseDto] })
  payers!: PayerAllocationResponseDto[];
  @ApiProperty({ type: [SplitAllocationResponseDto] })
  splits!: SplitAllocationResponseDto[];
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  ledgerEntries!: LedgerEntryResponseDto[];
  @ApiProperty({ type: ExpensePermissionsResponseDto })
  permissions!: ExpensePermissionsResponseDto;
  @ApiPropertyOptional({
    type: () => ValuationSnapshotResponseDto,
    nullable: true,
  })
  valuation!: ValuationSnapshotResponseDto | null;
}

export class ExpenseRevisionResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: Number }) revisionNumber!: number;
  @ApiProperty({ enum: ExpenseRevisionAction }) action!: ExpenseRevisionAction;
  @ApiProperty({ type: FinancialUserDto }) actor!: FinancialUserDto;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String, example: "2500" }) totalMinor!: string;
  @ApiProperty({ type: String, example: "USD" }) currency!: string;
  @ApiProperty({ type: String, example: "2026-08-17" }) expenseDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ enum: SplitMethod }) splitMethod!: SplitMethod;
  @ApiProperty({ type: [PayerAllocationResponseDto] })
  payers!: PayerAllocationResponseDto[];
  @ApiProperty({ type: [SplitAllocationResponseDto] })
  splits!: SplitAllocationResponseDto[];
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  ledgerEntries!: LedgerEntryResponseDto[];
  @ApiPropertyOptional({
    type: () => CategorySnapshotResponseDto,
    nullable: true,
  })
  category!: CategorySnapshotResponseDto | null;
  @ApiPropertyOptional({
    type: () => ValuationSnapshotResponseDto,
    nullable: true,
  })
  valuation!: ValuationSnapshotResponseDto | null;
}

export class ExpensePageResponseDto {
  @ApiProperty({ type: [ExpenseSummaryResponseDto] })
  items!: ExpenseSummaryResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
}

export class ExpenseRevisionPageResponseDto {
  @ApiProperty({ type: [ExpenseRevisionResponseDto] })
  items!: ExpenseRevisionResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
}

export class BalanceAmountResponseDto {
  @ApiProperty({ type: String, example: "USD" }) currency!: string;
  @ApiProperty({ type: String, example: "100" }) youOweMinor!: string;
  @ApiProperty({ type: String, example: "50" }) youAreOwedMinor!: string;
  @ApiProperty({ type: String, example: "-50" }) netMinor!: string;
}

export class BalanceContextResponseDto {
  @ApiProperty({ enum: ["GROUP", "FRIENDSHIP"] }) contextType!:
    "GROUP" | "FRIENDSHIP";
  @ApiProperty({ type: String, format: "uuid" }) contextId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [BalanceAmountResponseDto] })
  amounts!: BalanceAmountResponseDto[];
}

export class ConvertedRateSourceResponseDto {
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({ type: String, format: "date" }) effectiveDate!: string;
  @ApiProperty({ type: String, format: "date-time" }) capturedAt!: Date;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: Boolean }) manual!: boolean;
  @ApiProperty({ type: Boolean }) stale!: boolean;
}

export class ConvertedSummaryResponseDto {
  @ApiProperty({ type: String }) reportingCurrency!: string;
  @ApiProperty({ type: String }) youOweMinor!: string;
  @ApiProperty({ type: String }) youAreOwedMinor!: string;
  @ApiProperty({ type: String }) netMinor!: string;
  @ApiProperty({ type: Boolean }) incomplete!: boolean;
  @ApiProperty({ type: [ConvertedRateSourceResponseDto] })
  sources!: ConvertedRateSourceResponseDto[];
  @ApiProperty({ type: [String] }) warnings!: string[];
}

export class OverallBalancesResponseDto {
  @ApiProperty({ type: [BalanceAmountResponseDto] })
  totals!: BalanceAmountResponseDto[];
  @ApiProperty({ type: [BalanceContextResponseDto] })
  contexts!: BalanceContextResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
  @ApiPropertyOptional({ type: () => ConvertedSummaryResponseDto })
  convertedSummary?: ConvertedSummaryResponseDto;
}

export class BalancePositionResponseDto {
  @ApiProperty({ type: FinancialUserDto }) user!: FinancialUserDto;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ type: String }) netMinor!: string;
}

export class BalanceTransferResponseDto {
  @ApiProperty({ type: FinancialUserDto }) from!: FinancialUserDto;
  @ApiProperty({ type: FinancialUserDto }) to!: FinancialUserDto;
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ type: String }) currency!: string;
}

export class GroupBalancesResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) groupId!: string;
  @ApiProperty({ type: Boolean }) simplifyDebtsEnabled!: boolean;
  @ApiProperty({ type: [BalanceAmountResponseDto] })
  currentUser!: BalanceAmountResponseDto[];
  @ApiProperty({ type: [BalancePositionResponseDto] })
  positions!: BalancePositionResponseDto[];
  @ApiProperty({ type: [BalanceTransferResponseDto] })
  rawObligations!: BalanceTransferResponseDto[];
  @ApiProperty({ type: [BalanceTransferResponseDto] })
  recommendations!: BalanceTransferResponseDto[];
  @ApiPropertyOptional({ type: () => ConvertedSummaryResponseDto })
  convertedSummary?: ConvertedSummaryResponseDto;
}

export class FriendBalancesResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) friendshipId!: string;
  @ApiProperty({ type: FinancialUserDto }) friend!: FinancialUserDto;
  @ApiProperty({ type: [BalanceAmountResponseDto] })
  amounts!: BalanceAmountResponseDto[];
  @ApiPropertyOptional({ type: () => ConvertedSummaryResponseDto })
  convertedSummary?: ConvertedSummaryResponseDto;
}

class BalanceBreakdownItemBaseResponseDto {
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ enum: ["OWE", "OWED"] }) direction!: "OWE" | "OWED";
  @ApiProperty({ type: FinancialUserDto }) counterparty!: FinancialUserDto;
}

export class ExpenseBalanceBreakdownItemResponseDto extends BalanceBreakdownItemBaseResponseDto {
  @ApiProperty({ enum: ["EXPENSE"] }) sourceType!: "EXPENSE";
  @ApiProperty({ type: ExpenseSummaryResponseDto })
  expense!: ExpenseSummaryResponseDto;
}

export class SettlementBreakdownSourceResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ type: String, format: "date" }) settledOn!: string;
  @ApiProperty({ enum: ["ACTIVE", "REVERSED"] }) status!: "ACTIVE" | "REVERSED";
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  groupId!: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  friendshipId!: string | null;
}

export class SettlementBalanceBreakdownItemResponseDto extends BalanceBreakdownItemBaseResponseDto {
  @ApiProperty({ enum: ["SETTLEMENT"] }) sourceType!: "SETTLEMENT";
  @ApiProperty({ type: SettlementBreakdownSourceResponseDto })
  settlement!: SettlementBreakdownSourceResponseDto;
}

export class BalanceBreakdownPageResponseDto {
  @ApiProperty({
    type: "array",
    items: {
      oneOf: [
        { $ref: getSchemaPath(ExpenseBalanceBreakdownItemResponseDto) },
        { $ref: getSchemaPath(SettlementBalanceBreakdownItemResponseDto) },
      ],
      discriminator: {
        propertyName: "sourceType",
        mapping: {
          EXPENSE: getSchemaPath(ExpenseBalanceBreakdownItemResponseDto),
          SETTLEMENT: getSchemaPath(SettlementBalanceBreakdownItemResponseDto),
        },
      },
    },
  })
  items!: Array<
    | ExpenseBalanceBreakdownItemResponseDto
    | SettlementBalanceBreakdownItemResponseDto
  >;
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
}
