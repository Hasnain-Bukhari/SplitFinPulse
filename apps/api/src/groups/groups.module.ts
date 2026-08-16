import { Module } from "@nestjs/common";
import { GroupInvitationsController } from "./group-invitations.controller";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { GroupAccessService } from "./group-access.service";
import { GroupInvitationsService } from "./group-invitations.service";
import { GroupMembershipsService } from "./group-memberships.service";

@Module({
  controllers: [GroupsController, GroupInvitationsController],
  providers: [
    GroupAccessService,
    GroupsService,
    GroupMembershipsService,
    GroupInvitationsService,
  ],
  exports: [GroupsService],
})
export class GroupsModule {}
