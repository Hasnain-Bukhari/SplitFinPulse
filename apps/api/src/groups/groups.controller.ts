import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiCookieAuth, ApiExtraModels, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import {
  AddGroupMemberDto,
  CreateGroupDto,
  GroupPageQueryDto,
  GroupInvitationPageQueryDto,
  GroupMemberPageQueryDto,
  TransferGroupOwnershipDto,
  UpdateGroupDto,
  UpdateGroupMemberDto,
} from "./groups.dto";
import { GroupsService } from "./groups.service";
import { GroupMembershipsService } from "./group-memberships.service";
import { GroupInvitationsService } from "./group-invitations.service";

@ApiTags("Groups")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(
  CreateGroupDto,
  UpdateGroupDto,
  GroupPageQueryDto,
  AddGroupMemberDto,
  UpdateGroupMemberDto,
  GroupInvitationPageQueryDto,
  GroupMemberPageQueryDto,
  TransferGroupOwnershipDto,
)
@Controller("groups")
export class GroupsController {
  constructor(
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(GroupMembershipsService)
    private readonly memberships: GroupMembershipsService,
    @Inject(GroupInvitationsService)
    private readonly invitationsService: GroupInvitationsService,
  ) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: GroupPageQueryDto,
  ) {
    return this.groups.list(
      principal.userId,
      query.status,
      query.cursor,
      query.limit ?? 20,
    );
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateGroupDto,
  ) {
    return this.groups.create(principal.userId, input);
  }

  @Get(":groupId")
  detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.detail(principal.userId, groupId);
  }

  @Patch(":groupId")
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() input: UpdateGroupDto,
  ) {
    return this.groups.update(principal.userId, groupId, input);
  }

  @Post(":groupId/archive")
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.archive(principal.userId, groupId);
  }

  @Post(":groupId/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.restore(principal.userId, groupId);
  }

  @Delete(":groupId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.removeGroup(principal.userId, groupId);
  }

  @Get(":groupId/members")
  members(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Query() query: GroupMemberPageQueryDto,
  ) {
    return this.memberships.list(
      principal.userId,
      groupId,
      query.cursor,
      query.limit ?? 20,
    );
  }

  @Post(":groupId/members")
  addMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() input: AddGroupMemberDto,
  ) {
    return this.memberships.add(principal.userId, groupId, input);
  }

  @Patch(":groupId/members/:membershipId")
  updateMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() input: UpdateGroupMemberDto,
  ) {
    return this.memberships.updateRole(
      principal.userId,
      groupId,
      membershipId,
      input.role,
    );
  }

  @Delete(":groupId/members/:membershipId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
  ) {
    return this.memberships.remove(principal.userId, groupId, membershipId);
  }

  @Post(":groupId/leave")
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.memberships.leave(principal.userId, groupId);
  }

  @Post(":groupId/invitations")
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  createInvitation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.invitationsService.create(principal.userId, groupId);
  }

  @Get(":groupId/invitations")
  invitations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Query() query: GroupInvitationPageQueryDto,
  ) {
    return this.invitationsService.list(
      principal.userId,
      groupId,
      query.cursor,
      query.limit ?? 20,
    );
  }

  @Delete(":groupId/invitations/:invitationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitationsService.revoke(
      principal.userId,
      groupId,
      invitationId,
    );
  }

  @Post(":groupId/transfer-ownership")
  @HttpCode(HttpStatus.OK)
  transferOwnership(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() input: TransferGroupOwnershipDto,
  ) {
    return this.memberships.transferOwnership(
      principal.userId,
      groupId,
      input.membershipId,
    );
  }
}
