import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

export class BalanceBreakdownQueryDto {
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
  counterpartyId?: string;
  @ApiPropertyOptional({ type: String, pattern: "^[A-Z]{3}$" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({ type: String, pattern: "^[A-Z]{3}$" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  reportingCurrency?: string;
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

export class OverallBalanceQueryDto {
  @ApiPropertyOptional({ type: String, pattern: "^[A-Z]{3}$" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  reportingCurrency?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class ConversionQueryDto {
  @ApiPropertyOptional({ type: String, pattern: "^[A-Z]{3}$" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  reportingCurrency?: string;
}
