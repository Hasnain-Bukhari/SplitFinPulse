import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateReminderDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() recipientId!: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  friendshipId?: string;
  @ApiProperty({ type: String, pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @ApiPropertyOptional({ type: String, format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledFor?: string;
}

export class ReminderPageQueryDto {
  @ApiProperty({ type: String, enum: ["sent", "received"] })
  @IsIn(["sent", "received"])
  direction!: "sent" | "received";
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
}
