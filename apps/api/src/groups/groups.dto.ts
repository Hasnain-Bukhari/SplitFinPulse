import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

export enum GroupTypeDto {
  TRIP = "TRIP",
  HOME = "HOME",
  COUPLE = "COUPLE",
  OTHER = "OTHER",
}

export enum GroupStatusDto {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum GroupRoleDto {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export class CreateGroupDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: GroupTypeDto })
  @IsEnum(GroupTypeDto)
  type!: GroupTypeDto;

  @ApiProperty({ type: String, example: "USD", pattern: "^[A-Z]{3}$" })
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency!: string;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  simplifyDebtsEnabled?: boolean;
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}

export class GroupPageQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: GroupStatusDto })
  @IsOptional()
  @IsEnum(GroupStatusDto)
  status?: GroupStatusDto;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class AddGroupMemberDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  userId!: string;
}

export class UpdateGroupMemberDto {
  @ApiProperty({ enum: [GroupRoleDto.ADMIN, GroupRoleDto.MEMBER] })
  @IsIn([GroupRoleDto.ADMIN, GroupRoleDto.MEMBER])
  role!: GroupRoleDto.ADMIN | GroupRoleDto.MEMBER;
}

export class TransferGroupOwnershipDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  membershipId!: string;
}

export class GroupInvitationPageQueryDto {
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

export class GroupMemberPageQueryDto extends GroupInvitationPageQueryDto {}
