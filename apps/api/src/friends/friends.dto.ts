import { Transform, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class PageQueryDto {
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

export enum RequestDirection {
  INCOMING = "incoming",
  OUTGOING = "outgoing",
}

export class RequestPageQueryDto extends PageQueryDto {
  @ApiProperty({ enum: RequestDirection })
  @IsEnum(RequestDirection)
  direction!: RequestDirection;
}

export class DiscoveryQueryDto {
  @ApiProperty({ type: String, format: "email" })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

export class CreateFriendRequestDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  userId!: string;
}

export class ContactDiscoveryDto {
  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  emails!: string[];
}
