import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import {
  SecurityEventPageQueryDto,
  SecurityEventPageResponseDto,
} from "./audit.dto";
import { AuditService } from "./audit.service";

@ApiTags("Account security")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(SecurityEventPageQueryDto)
@Controller("users/me/security-events")
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse({ type: SecurityEventPageResponseDto })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SecurityEventPageQueryDto,
  ) {
    return this.audit.personalSecurityEvents(
      principal.userId,
      query.cursor,
      query.limit,
    );
  }
}
