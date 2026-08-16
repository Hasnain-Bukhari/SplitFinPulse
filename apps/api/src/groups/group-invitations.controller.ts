import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { Public } from "../http/public.decorator";
import { GroupInvitationsService } from "./group-invitations.service";

@ApiTags("Group invitations")
@Controller("group-invitations")
export class GroupInvitationsController {
  constructor(
    @Inject(GroupInvitationsService)
    private readonly invitations: GroupInvitationsService,
  ) {}

  @Get(":token")
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  preview(@Param("token") token: string) {
    return this.invitations.preview(token);
  }

  @Post(":token/accept")
  @ApiCookieAuth("sfp_access")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("token") token: string,
  ) {
    return this.invitations.accept(principal.userId, token);
  }
}
