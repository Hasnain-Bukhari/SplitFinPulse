import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

export class ManualRateDto {
  @ApiProperty({ example: "THB", pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  quoteCurrency!: string;

  @ApiProperty({ example: "36.125", pattern: "^[0-9]+(?:\\.[0-9]{1,18})?$" })
  @Matches(/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]{1,18})?)$/)
  rateDecimal!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  sourceLabel?: string;
}

export class CreateValuationDto {
  @ApiProperty({ example: "USD", pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  baseCurrency!: string;

  @ApiProperty({ format: "date" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveDate!: string;

  @ApiPropertyOptional({ type: String, pattern: "^(?:0|[1-9][0-9]*)$" })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9][0-9]*)$/)
  amountMinor?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Z]{3}$/, { each: true })
  quoteCurrencies?: string[];

  @ApiPropertyOptional({ type: [ManualRateDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ManualRateDto)
  manualRates?: ManualRateDto[];
}

export class FinancialValuationInputDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  valuationId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowUnavailableConversion?: boolean;
}
