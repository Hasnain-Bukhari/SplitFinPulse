import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class NotificationPreferencesDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  expenseActivity!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  reminders!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  invitations!: boolean;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  avatarVisible?: boolean;

  @ApiPropertyOptional({ type: String, example: "USD", pattern: "^[A-Z]{3}$" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency?: string;

  @ApiPropertyOptional({
    type: String,
    example: "Asia/Bangkok",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ type: String, example: "en-US", maxLength: 35 })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  locale?: string;

  @ApiPropertyOptional({ type: () => NotificationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notificationPreferences?: NotificationPreferencesDto;
}

export class DeleteAccountDto {
  @ApiProperty({ type: String, enum: ["DELETE"] })
  @Equals("DELETE")
  confirmation!: "DELETE";
}
