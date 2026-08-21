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
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import {
  NotificationPageQueryDto,
  RegisterPushDeviceDto,
  UpdateChannelPreferencesDto,
} from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(NotificationPageQueryDto, UpdateChannelPreferencesDto)
@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}
  @Get() @ApiOkResponse() list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: NotificationPageQueryDto,
  ) {
    return this.notifications.list(principal.userId, query);
  }
  @Get("unread-count") @ApiOkResponse() unread(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.notifications.unreadCount(principal.userId);
  }
  @Patch(":id/read") @ApiOkResponse() read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(principal.userId, id);
  }
  @Post("read-all") @HttpCode(HttpStatus.OK) @ApiOkResponse() readAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.notifications.readAll(principal.userId);
  }
  @Get("preferences") @ApiOkResponse() preferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.notifications.preferences(principal.userId);
  }
  @Patch("preferences") @ApiOkResponse() updatePreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: UpdateChannelPreferencesDto,
  ) {
    return this.notifications.updatePreferences(principal.userId, input);
  }
}

@ApiTags("Push devices")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(RegisterPushDeviceDto)
@Controller("push-devices")
export class PushDevicesController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}
  @Post() register(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: RegisterPushDeviceDto,
  ) {
    return this.notifications.registerDevice(principal, input.token);
  }
  @Delete(":id") @HttpCode(HttpStatus.OK) retire(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.retireDevice(principal.userId, id);
  }
}
