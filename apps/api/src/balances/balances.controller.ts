import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import {
  BalanceBreakdownQueryDto,
  OverallBalanceQueryDto,
} from "./balances.dto";
import { BalancesService } from "./balances.service";
import {
  BalanceBreakdownPageResponseDto,
  ExpenseBalanceBreakdownItemResponseDto,
  FriendBalancesResponseDto,
  GroupBalancesResponseDto,
  OverallBalancesResponseDto,
  SettlementBalanceBreakdownItemResponseDto,
  SettlementBreakdownSourceResponseDto,
} from "../expenses/financial-response.dto";

@ApiTags("Balances")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(
  BalanceBreakdownQueryDto,
  OverallBalanceQueryDto,
  ExpenseBalanceBreakdownItemResponseDto,
  SettlementBalanceBreakdownItemResponseDto,
  SettlementBreakdownSourceResponseDto,
)
@Controller("balances")
export class BalancesController {
  constructor(
    @Inject(BalancesService) private readonly balances: BalancesService,
  ) {}
  @Get()
  @ApiOkResponse({ type: OverallBalancesResponseDto })
  overall(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: OverallBalanceQueryDto,
  ) {
    return this.balances.overall(principal.userId, query.cursor, query.limit);
  }
  @Get("groups/:groupId")
  @ApiOkResponse({ type: GroupBalancesResponseDto })
  group(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) id: string,
  ) {
    return this.balances.group(principal.userId, id);
  }
  @Get("friends/:friendshipId")
  @ApiOkResponse({ type: FriendBalancesResponseDto })
  friend(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("friendshipId", ParseUUIDPipe) id: string,
  ) {
    return this.balances.friend(principal.userId, id);
  }
  @Get("breakdown")
  @ApiOkResponse({ type: BalanceBreakdownPageResponseDto })
  breakdown(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: BalanceBreakdownQueryDto,
  ) {
    return this.balances.breakdown(principal.userId, query);
  }
}
