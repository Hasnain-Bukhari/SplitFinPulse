import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID, Matches } from "class-validator";

export enum BudgetScopeDto {
  PERSONAL = "PERSONAL",
  CATEGORY = "CATEGORY",
  GROUP = "GROUP",
}
export class BudgetInputDto {
  @ApiProperty({ type: String, enum: BudgetScopeDto })
  @IsEnum(BudgetScopeDto)
  scope!: BudgetScopeDto;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
  @ApiProperty({ type: String, pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @ApiProperty({ type: String, pattern: "^[1-9]\\d*$" })
  @Matches(/^[1-9]\d*$/)
  amountMinor!: string;
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}$" })
  @Matches(/^\d{4}-\d{2}$/)
  startMonth!: string;
  @ApiPropertyOptional({ type: String, pattern: "^\\d{4}-\\d{2}$" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  endMonth?: string;
}
export class BudgetListQueryDto {
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}$" })
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}
