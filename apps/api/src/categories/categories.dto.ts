import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";

export class CategoryQueryDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived = false;
}

export class CreateCategoryDto {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 40, pattern: "^[a-z0-9-]+$" })
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z0-9-]+$/)
  icon!: string;
}

export class UpdateCategoryDto extends CreateCategoryDto {}

export class CategoryResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ enum: ["SYSTEM", "USER"] }) kind!: "SYSTEM" | "USER";
  @ApiProperty({ type: String }) key!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) icon!: string;
  @ApiProperty({ type: Boolean }) archived!: boolean;
  @ApiProperty({ type: Boolean }) canManage!: boolean;
}
