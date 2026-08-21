import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CreateReminderDto, ReminderPageQueryDto } from "./reminders.dto";
import { RemindersService } from "./reminders.service";

@ApiTags("Reminders")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(CreateReminderDto, ReminderPageQueryDto)
@Controller("reminders")
export class RemindersController {
  constructor(
    @Inject(RemindersService) private readonly reminders: RemindersService,
  ) {}
  @Post() @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateReminderDto,
  ) {
    return this.reminders.create(principal.userId, input);
  }
  @Get() @ApiOkResponse() list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ReminderPageQueryDto,
  ) {
    return this.reminders.list(principal.userId, query);
  }
  @Delete(":id") @HttpCode(HttpStatus.OK) cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.reminders.cancel(principal.userId, id);
  }
}
