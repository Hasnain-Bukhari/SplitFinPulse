import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { ExpenseInputDto } from "../expenses/expenses.dto";

export enum RecurrenceUnitDto {
  DAY = "DAY",
  WEEK = "WEEK",
  MONTH = "MONTH",
  YEAR = "YEAR",
}

export class RecurrenceRuleDto {
  @ApiProperty({ type: String, enum: RecurrenceUnitDto })
  @IsEnum(RecurrenceUnitDto)
  unit!: RecurrenceUnitDto;
  @ApiProperty({ type: Number, minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  interval!: number;
  @ApiPropertyOptional({ type: [Number], minItems: 1, maxItems: 7 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  anchorDate!: string;
  @ApiProperty({ type: String, pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  localTime!: string;
  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  timezone!: string;
  @ApiPropertyOptional({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
}

export class RecurringExpenseInputDto {
  @ApiProperty({ type: ExpenseInputDto })
  @ValidateNested()
  @Type(() => ExpenseInputDto)
  template!: ExpenseInputDto;
  @ApiProperty({ type: RecurrenceRuleDto })
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  schedule!: RecurrenceRuleDto;
}

export class RecurringExpensePageQueryDto {
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
  @ApiPropertyOptional({
    type: String,
    enum: ["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"],
  })
  @IsOptional()
  @IsIn(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"])
  status?: "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
}
