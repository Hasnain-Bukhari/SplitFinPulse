import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class SearchQueryDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  q!: string;

  @ApiPropertyOptional({
    enum: ["ALL", "EXPENSE", "GROUP", "PERSON"],
    default: "ALL",
  })
  @IsOptional()
  @IsIn(["ALL", "EXPENSE", "GROUP", "PERSON"])
  type: "ALL" | "EXPENSE" | "GROUP" | "PERSON" = "ALL";

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}
