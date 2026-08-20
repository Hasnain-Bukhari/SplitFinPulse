import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateCommentDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  @Matches(/\S/)
  body!: string;
}

export class UpdateCommentDto extends CreateCommentDto {}

export class CommentPageQueryDto {
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

class CommentAuthorResponseDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;
}

class CommentPermissionsResponseDto {
  @ApiProperty({ type: Boolean })
  canEdit!: boolean;

  @ApiProperty({ type: Boolean })
  canDelete!: boolean;
}

export class CommentResponseDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  expenseId!: string;

  @ApiProperty({ type: CommentAuthorResponseDto })
  author!: CommentAuthorResponseDto;

  @ApiPropertyOptional({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({ type: Number })
  version!: number;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  deletedAt!: Date | null;

  @ApiProperty({ type: CommentPermissionsResponseDto })
  permissions!: { canEdit: boolean; canDelete: boolean };
}

export class CommentPageResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items!: CommentResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor!: string | null;
}
