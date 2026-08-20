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
  ActivityPageQueryDto,
  ActivityPageResponseDto,
} from "./activities.dto";
import { ActivitiesService } from "./activities.service";

@ApiTags("Activity")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(ActivityPageQueryDto)
@Controller("activities")
export class ActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ActivityPageResponseDto })
  personal(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ActivityPageQueryDto,
  ) {
    return this.activities.personal(
      principal.userId,
      query.cursor,
      query.limit,
    );
  }

  @Get("groups/:groupId")
  @ApiOkResponse({ type: ActivityPageResponseDto })
  group(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Query() query: ActivityPageQueryDto,
  ) {
    return this.activities.group(
      principal.userId,
      groupId,
      query.cursor,
      query.limit,
    );
  }
}

@ApiTags("Activity")
@ApiCookieAuth("sfp_access")
@Controller("groups/:groupId/activities")
export class GroupActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ActivityPageResponseDto })
  group(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Query() query: ActivityPageQueryDto,
  ) {
    return this.activities.group(
      principal.userId,
      groupId,
      query.cursor,
      query.limit,
    );
  }
}
