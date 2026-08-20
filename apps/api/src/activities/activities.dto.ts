import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const documentedActivityTypes = [
  "EXPENSE_CREATED",
  "EXPENSE_UPDATED",
  "EXPENSE_DELETED",
  "EXPENSE_RESTORED",
  "GROUP_CREATED",
  "GROUP_UPDATED",
  "GROUP_ARCHIVED",
  "GROUP_RESTORED",
  "GROUP_MEMBER_ADDED",
  "GROUP_MEMBER_ROLE_UPDATED",
  "GROUP_MEMBER_REMOVED",
  "GROUP_MEMBER_LEFT",
  "GROUP_OWNERSHIP_TRANSFERRED",
  "SETTLEMENT_CREATED",
  "SETTLEMENT_REPLACED",
  "SETTLEMENT_REVERSED",
  "COMMENT_CREATED",
  "COMMENT_UPDATED",
  "COMMENT_DELETED",
] as const;

export class ActivityPageQueryDto {
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

class ActivityActorResponseDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;
}

export class ActivityEventResponseDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ enum: documentedActivityTypes })
  type!: string;

  @ApiPropertyOptional({ type: ActivityActorResponseDto, nullable: true })
  actor!: ActivityActorResponseDto | null;

  @ApiProperty({
    enum: ["EXPENSE", "GROUP", "GROUP_MEMBER", "SETTLEMENT", "COMMENT"],
  })
  entityType!: string;

  @ApiProperty({ type: String, format: "uuid" })
  entityId!: string;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  groupId!: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  friendshipId!: string | null;

  @ApiProperty({ type: Number, example: 1 })
  payloadVersion!: number;

  @ApiProperty({ type: Object, additionalProperties: true })
  payload!: object;

  @ApiProperty({ type: String, format: "date-time" })
  occurredAt!: Date;
}

export class ActivityPageResponseDto {
  @ApiProperty({ type: [ActivityEventResponseDto] })
  items!: ActivityEventResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor!: string | null;
}
