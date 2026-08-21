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
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { ApiException } from "../http/api.exception";
import { BudgetInputDto, BudgetListQueryDto } from "./budgets.dto";
import { BudgetsService } from "./budgets.service";

@ApiTags("Budgets")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(BudgetInputDto, BudgetListQueryDto)
@Controller("budgets")
export class BudgetsController {
  constructor(
    @Inject(BudgetsService) private readonly budgets: BudgetsService,
  ) {}
  @Post() create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: BudgetInputDto,
  ) {
    return this.budgets.create(principal.userId, input);
  }
  @Get() @ApiOkResponse() list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: BudgetListQueryDto,
  ) {
    return this.budgets.list(principal.userId, query.month);
  }
  @Get(":id") async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.budgets.detail(principal.userId, id);
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }
  @Patch(":id") update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() input: BudgetInputDto,
  ) {
    return this.budgets.update(
      principal.userId,
      id,
      this.version(ifMatch),
      input,
    );
  }
  @Post(":id/archive") @HttpCode(HttpStatus.OK) archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("if-match") ifMatch: string | undefined,
  ) {
    return this.budgets.archive(principal.userId, id, this.version(ifMatch));
  }
  private version(value?: string) {
    const match = value?.match(/^(?:W\/)?"?(\d+)"?$/);
    if (!match)
      throw new ApiException(
        HttpStatus.PRECONDITION_REQUIRED,
        "VERSION_REQUIRED",
        "If-Match is required",
      );
    return Number(match[1]);
  }
}
