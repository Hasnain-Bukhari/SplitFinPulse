import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  SettlementMethod,
  SettlementRevisionAction,
  SettlementStatus,
} from "../generated/prisma/client";
import { FinancialUserDto } from "../expenses/financial-response.dto";

export class SettlementPermissionsDto {
  @ApiProperty({ type: Boolean }) canReverse!: boolean;
  @ApiProperty({ type: Boolean }) canCorrect!: boolean;
}

export class SettlementDetailResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  groupId!: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  friendshipId!: string | null;
  @ApiProperty({ enum: SettlementStatus }) status!: SettlementStatus;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: FinancialUserDto }) actor!: FinancialUserDto;
  @ApiProperty({ type: FinancialUserDto }) from!: FinancialUserDto;
  @ApiProperty({ type: FinancialUserDto }) to!: FinancialUserDto;
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ enum: SettlementMethod }) method!: SettlementMethod;
  @ApiPropertyOptional({ type: String, nullable: true }) methodLabel!:
    string | null;
  @ApiProperty({ type: String }) settledOn!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reversalReason!:
    string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  replacesSettlementId!: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  replacementSettlementId!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: Date;
  @ApiProperty({ type: SettlementPermissionsDto })
  permissions!: SettlementPermissionsDto;
}

export class SettlementRevisionResponseDto extends SettlementDetailResponseDto {
  @ApiProperty({ enum: SettlementRevisionAction })
  action!: SettlementRevisionAction;
  @ApiProperty({ type: Number }) revisionNumber!: number;
}

export class SettlementPageResponseDto {
  @ApiProperty({ type: [SettlementDetailResponseDto] })
  items!: SettlementDetailResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
}

export class SettlementRevisionPageResponseDto {
  @ApiProperty({ type: [SettlementRevisionResponseDto] })
  items!: SettlementRevisionResponseDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor!:
    string | null;
}
