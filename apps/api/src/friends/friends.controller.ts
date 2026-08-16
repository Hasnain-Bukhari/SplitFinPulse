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
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiExtraModels, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import {
  ContactDiscoveryDto,
  CreateFriendRequestDto,
  DiscoveryQueryDto,
  PageQueryDto,
  RequestPageQueryDto,
} from "./friends.dto";
import { FriendsService } from "./friends.service";

@ApiTags("Friends")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(
  ContactDiscoveryDto,
  CreateFriendRequestDto,
  DiscoveryQueryDto,
  PageQueryDto,
  RequestPageQueryDto,
)
@Controller("friends")
export class FriendsController {
  constructor(
    @Inject(FriendsService) private readonly friends: FriendsService,
  ) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: PageQueryDto,
  ) {
    return this.friends.list(principal.userId, query.cursor, query.limit ?? 20);
  }

  @Get("requests")
  requests(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: RequestPageQueryDto,
  ) {
    return this.friends.requests(
      principal.userId,
      query.direction,
      query.cursor,
      query.limit ?? 20,
    );
  }

  @Get("discovery")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  discover(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: DiscoveryQueryDto,
  ) {
    return this.friends.discover(principal.userId, query.email);
  }

  @Post("discovery/contacts")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  discoverContacts(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: ContactDiscoveryDto,
  ) {
    return this.friends.discoverContacts(principal.userId, input.emails);
  }

  @Post("requests")
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  createRequest(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateFriendRequestDto,
  ) {
    return this.friends.request(principal.userId, input.userId);
  }

  @Post("requests/:friendshipId/accept")
  accept(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("friendshipId", ParseUUIDPipe) friendshipId: string,
  ) {
    return this.friends.accept(principal.userId, friendshipId);
  }

  @Post("requests/:friendshipId/decline")
  decline(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("friendshipId", ParseUUIDPipe) friendshipId: string,
  ) {
    return this.friends.decline(principal.userId, friendshipId);
  }

  @Delete(":friendshipId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("friendshipId", ParseUUIDPipe) friendshipId: string,
  ) {
    return this.friends.remove(principal.userId, friendshipId);
  }
}
