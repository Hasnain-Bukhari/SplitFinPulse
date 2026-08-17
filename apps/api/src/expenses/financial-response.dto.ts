import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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

export class OverallBalancesResponseDto {
  @ApiProperty({ type: [BalanceAmountResponseDto] })
  totals!: BalanceAmountResponseDto[];
  @ApiProperty({ type: [BalanceContextResponseDto] })
  contexts!: BalanceContextResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
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
}

export class FriendBalancesResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) friendshipId!: string;
  @ApiProperty({ type: FinancialUserDto }) friend!: FinancialUserDto;
  @ApiProperty({ type: [BalanceAmountResponseDto] })
  amounts!: BalanceAmountResponseDto[];
}

export class BalanceBreakdownItemResponseDto {
  @ApiProperty({ type: ExpenseSummaryResponseDto })
  expense!: ExpenseSummaryResponseDto;
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ enum: ["OWE", "OWED"] }) direction!: "OWE" | "OWED";
  @ApiProperty({ type: FinancialUserDto }) counterparty!: FinancialUserDto;
}

export class BalanceBreakdownPageResponseDto {
  @ApiProperty({ type: [BalanceBreakdownItemResponseDto] })
  items!: BalanceBreakdownItemResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
}
