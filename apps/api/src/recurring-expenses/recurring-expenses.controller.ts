import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { ApiException } from "../http/api.exception";
import {
  RecurringExpenseInputDto,
  RecurringExpensePageQueryDto,
} from "./recurring-expenses.dto";
import { RecurringExpensesService } from "./recurring-expenses.service";

@ApiTags("Recurring expenses")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(RecurringExpenseInputDto, RecurringExpensePageQueryDto)
@Controller("recurring-expenses")
export class RecurringExpensesController {
  constructor(
    @Inject(RecurringExpensesService)
    private readonly recurring: RecurringExpensesService,
  ) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  preview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: RecurringExpenseInputDto,
  ) {
    return this.recurring.preview(principal.userId, input);
  }

  @Post()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiCreatedResponse()
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body() input: RecurringExpenseInputDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.recurring.create(
      principal.userId,
      key ?? "",
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Get()
  @ApiOkResponse()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: RecurringExpensePageQueryDto,
  ) {
    return this.recurring.list(principal.userId, query);
  }

  @Get(":id")
  @ApiOkResponse()
  async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.recurring.detail(principal.userId, id);
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Patch(":id")
  @ApiOkResponse()
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() input: RecurringExpenseInputDto,
  ) {
    return this.recurring.update(
      principal.userId,
      id,
      this.version(ifMatch),
      input,
    );
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  pause(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("if-match") ifMatch: string | undefined,
  ) {
    return this.recurring.pause(principal.userId, id, this.version(ifMatch));
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  resume(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("if-match") ifMatch: string | undefined,
  ) {
    return this.recurring.resume(principal.userId, id, this.version(ifMatch));
  }

  @Get(":id/occurrences")
  @ApiOkResponse()
  occurrences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: RecurringExpensePageQueryDto,
  ) {
    return this.recurring.occurrences(
      principal.userId,
      id,
      query.cursor,
      query.limit,
    );
  }

  @Post(":id/occurrences/:occurrenceId/retry")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  retry(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("occurrenceId", ParseUUIDPipe) occurrenceId: string,
  ) {
    return this.recurring.retry(principal.userId, id, occurrenceId);
  }

  private version(value: string | undefined): number {
    const match = value?.match(/^(?:W\/)??"?(\d+)"?$/);
    if (!match)
      throw new ApiException(
        HttpStatus.PRECONDITION_REQUIRED,
        "VERSION_REQUIRED",
        "If-Match is required",
      );
    return Number(match[1]);
  }
}
