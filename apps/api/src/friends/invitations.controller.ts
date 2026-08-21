import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import { Public } from "../http/public.decorator";
import { InvitationsService } from "./invitations.service";
import { IsEmail } from "class-validator";

class EmailInvitationDto {
  @IsEmail() email!: string;
}

@ApiTags("Friend invitations")
@Controller("friend-invitations")
export class InvitationsController {
  constructor(
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}

  @Post()
  @ApiCookieAuth("sfp_access")
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.invitations.create(principal.userId);
  }

  @Post("email")
  @ApiCookieAuth("sfp_access")
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  email(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: EmailInvitationDto,
  ) {
    return this.invitations.createEmail(principal.userId, input.email);
  }

  @Get(":token")
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  preview(@Param("token") token: string) {
    return this.invitations.preview(token);
  }

  @Post(":token/accept")
  @ApiCookieAuth("sfp_access")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("token") token: string,
  ) {
    return this.invitations.accept(token, principal.userId);
  }
}
