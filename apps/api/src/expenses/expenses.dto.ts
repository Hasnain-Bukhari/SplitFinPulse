import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export enum SplitMethodDto {
  EQUAL = "EQUAL",
  EXACT = "EXACT",
  PERCENTAGE = "PERCENTAGE",
  SHARES = "SHARES",
}

export class ExpensePayerDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  userId!: string;

  @ApiProperty({ type: String, example: "1250", pattern: "^[1-9]\\d*$" })
  @Matches(/^[1-9]\d*$/)
  amountMinor!: string;
}

export class ExpenseParticipantDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    type: String,
    example: "50",
    pattern: "^\\d+(?:\\.\\d{1,6})?$",
    maxLength: 40,
  })
  @IsOptional()
  @Length(1, 40)
  @Matches(/^\d+(?:\.\d{1,6})?$/)
  input?: string;
}

export class ExpenseInputDto {
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  friendshipId?: string;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  valuationId?: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  description!: string;

  @Matches(/^[1-9]\d*$/)
  @ApiProperty({ type: String, example: "2500", pattern: "^[1-9]\\d*$" })
  totalMinor!: string;

  @ApiProperty({ type: String, example: "USD", pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({
    type: String,
    example: "2026-08-17",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expenseDate!: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @ApiProperty({ enum: SplitMethodDto })
  @IsEnum(SplitMethodDto)
  splitMethod!: SplitMethodDto;

  @ApiProperty({ type: () => [ExpensePayerDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExpensePayerDto)
  payers!: ExpensePayerDto[];

  @ApiProperty({
    type: () => [ExpenseParticipantDto],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantDto)
  participants!: ExpenseParticipantDto[];
}

export class ExpensePageQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  friendshipId?: string;
  @ApiPropertyOptional({ type: String, enum: ["ACTIVE", "DELETED"] })
  @IsOptional()
  @IsIn(["ACTIVE", "DELETED"])
  status?: "ACTIVE" | "DELETED";
  @ApiPropertyOptional({ type: String, pattern: "^[A-Z]{3}$" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;
  @ApiPropertyOptional({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  personId?: string;
  @ApiPropertyOptional({ enum: ["OPEN", "PARTIALLY_SETTLED", "SETTLED"] })
  @IsOptional()
  @IsIn(["OPEN", "PARTIALLY_SETTLED", "SETTLED"])
  settledState?: "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";
  @ApiPropertyOptional({
    enum: [
      "DATE_DESC",
      "DATE_ASC",
      "UPDATED_DESC",
      "AMOUNT_DESC",
      "AMOUNT_ASC",
    ],
    default: "UPDATED_DESC",
  })
  @IsOptional()
  @IsIn(["DATE_DESC", "DATE_ASC", "UPDATED_DESC", "AMOUNT_DESC", "AMOUNT_ASC"])
  sort?:
    "DATE_DESC" | "DATE_ASC" | "UPDATED_DESC" | "AMOUNT_DESC" | "AMOUNT_ASC";
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class RevisionPageQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
