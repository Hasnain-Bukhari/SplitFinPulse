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
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type {
  SettlementCorrectionDto,
  SettlementInputDto,
  SettlementPageQueryDto,
  SettlementRevisionPageQueryDto,
} from "./settlements.dto";
import {
  SettlementDetailResponseDto,
  SettlementPageResponseDto,
  SettlementRevisionPageResponseDto,
} from "./settlement-response.dto";
import { settlementVersionRequired } from "./settlement-errors";
import { SettlementsService } from "./settlements.service";

@ApiTags("Settlements")
@ApiCookieAuth("sfp_access")
@Controller("settlements")
export class SettlementsController {
  constructor(
    @Inject(SettlementsService)
    private readonly settlements: SettlementsService,
  ) {}

  @Post()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiCreatedResponse({ type: SettlementDetailResponseDto })
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body() input: SettlementInputDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.settlements.create(
      principal.userId,
      key ?? "",
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Get()
  @ApiOkResponse({ type: SettlementPageResponseDto })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SettlementPageQueryDto,
  ) {
    return this.settlements.list(principal.userId, query);
  }

  @Get(":settlementId")
  @ApiOkResponse({ type: SettlementDetailResponseDto })
  async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("settlementId", ParseUUIDPipe) settlementId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.settlements.detail(
      principal.userId,
      settlementId,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Get(":settlementId/revisions")
  @ApiOkResponse({ type: SettlementRevisionPageResponseDto })
  revisions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("settlementId", ParseUUIDPipe) settlementId: string,
    @Query() query: SettlementRevisionPageQueryDto,
  ) {
    return this.settlements.revisions(
      principal.userId,
      settlementId,
      query.cursor,
      query.limit ?? 20,
    );
  }

  @Post(":settlementId/corrections")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOkResponse({ type: SettlementDetailResponseDto })
  async correct(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("settlementId", ParseUUIDPipe) settlementId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() input: SettlementCorrectionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.settlements.correct(
      principal.userId,
      settlementId,
      this.parseVersion(ifMatch),
      key ?? "",
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  private parseVersion(value: string | undefined): number {
    const match = value?.match(/^(?:W\/)??"?(\d+)"?$/);
    if (!match) throw settlementVersionRequired();
    return Number(match[1]);
  }
}
