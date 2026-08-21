import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { SpendingAnalyticsQueryDto } from "./analytics.dto";
import { AnalyticsService } from "./analytics.service";

@ApiTags("Analytics")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(SpendingAnalyticsQueryDto)
@Controller("analytics")
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}
  @Get("spending") @ApiOkResponse() spending(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SpendingAnalyticsQueryDto,
  ) {
    return this.analytics.spending(principal.userId, query);
  }
}
