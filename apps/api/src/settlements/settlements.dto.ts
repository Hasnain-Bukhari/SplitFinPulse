import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
} from "class-validator";

export enum SettlementMethodDto {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CARD = "CARD",
  OTHER = "OTHER",
}

export class SettlementInputDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  fromUserId!: string;

  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  toUserId!: string;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiProperty({ type: String, example: "1250", pattern: "^[1-9]\\d*$" })
  @Matches(/^[1-9]\d*$/)
  amountMinor!: string;

  @ApiProperty({ type: String, example: "USD", pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ enum: SettlementMethodDto })
  @IsEnum(SettlementMethodDto)
  method!: SettlementMethodDto;

  @ApiPropertyOptional({ type: String, maxLength: 80 })
  @ValidateIf((input: SettlementInputDto) => input.methodLabel !== undefined)
  @IsString()
  @Length(1, 80)
  methodLabel?: string;

  @ApiProperty({ type: String, example: "2026-08-17" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  settledOn!: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  note?: string;
}

export class ReverseSettlementDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  @Matches(/\S/)
  reason!: string;
}

export class SettlementCorrectionDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  @Matches(/\S/)
  reason!: string;

  @ApiPropertyOptional({ type: () => SettlementInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementInputDto)
  replacement?: SettlementInputDto;
}

export class SettlementPageQueryDto {
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

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class SettlementRevisionPageQueryDto {
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
