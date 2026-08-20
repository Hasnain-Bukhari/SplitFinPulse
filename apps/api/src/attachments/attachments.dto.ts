import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

export class CreateUploadIntentDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @Length(1, 255)
  originalName!: string;

  @ApiProperty({
    enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  })
  @Matches(/^(?:image\/(?:jpeg|png|webp)|application\/pdf)$/)
  declaredMime!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  expenseId?: string;
}
