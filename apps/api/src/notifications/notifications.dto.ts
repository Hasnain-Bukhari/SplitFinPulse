import { Transform, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export enum NotificationCategoryDto {
  EXPENSE_ACTIVITY = "EXPENSE_ACTIVITY",
  INVITATIONS = "INVITATIONS",
  REMINDERS = "REMINDERS",
  BUDGET_ALERTS = "BUDGET_ALERTS",
}
export enum NotificationChannelDto {
  IN_APP = "IN_APP",
  PUSH = "PUSH",
  EMAIL = "EMAIL",
}

export class NotificationPageQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  unreadOnly = false;
}

export class ChannelPreferenceDto {
  @ApiProperty({ type: String, enum: NotificationCategoryDto })
  @IsEnum(NotificationCategoryDto)
  category!: NotificationCategoryDto;
  @ApiProperty({ type: String, enum: NotificationChannelDto })
  @IsEnum(NotificationChannelDto)
  channel!: NotificationChannelDto;
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateChannelPreferencesDto {
  @ApiProperty({ type: [ChannelPreferenceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ChannelPreferenceDto)
  preferences!: ChannelPreferenceDto[];
}

export class RegisterPushDeviceDto {
  @ApiProperty({ type: String, minLength: 20, maxLength: 4096 })
  @IsString()
  @Length(20, 4096)
  token!: string;
}
