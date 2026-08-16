import { Module } from "@nestjs/common";
import { FriendsController } from "./friends.controller";
import { FriendsService } from "./friends.service";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";

@Module({
  controllers: [FriendsController, InvitationsController],
  providers: [FriendsService, InvitationsService],
  exports: [FriendsService],
})
export class FriendsModule {}
