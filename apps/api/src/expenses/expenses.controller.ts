import {
  Body,
  Controller,
  Delete,
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
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import {
  ExpenseInputDto,
  ExpensePageQueryDto,
  RevisionPageQueryDto,
} from "./expenses.dto";
import { versionRequired } from "./expense-errors";
import { ExpensesService } from "./expenses.service";
import {
  ExpenseDetailResponseDto,
  ExpensePageResponseDto,
  ExpensePreviewResponseDto,
  ExpenseRevisionPageResponseDto,
} from "./financial-response.dto";

@ApiTags("Expenses")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(ExpenseInputDto, ExpensePageQueryDto, RevisionPageQueryDto)
@Controller("expenses")
export class ExpensesController {
  constructor(
    @Inject(ExpensesService) private readonly expenses: ExpensesService,
  ) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ExpensePreviewResponseDto })
  preview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: ExpenseInputDto,
  ) {
    return this.expenses.preview(principal.userId, input);
  }

  @Post()
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiCreatedResponse({ type: ExpenseDetailResponseDto })
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers("idempotency-key") key: string | undefined,
    @Body() input: ExpenseInputDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.expenses.create(
      principal.userId,
      key ?? "",
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Get()
  @ApiOkResponse({ type: ExpensePageResponseDto })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ExpensePageQueryDto,
  ) {
    return this.expenses.list(principal.userId, query);
  }

  @Get(":expenseId")
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.expenses.detail(principal.userId, expenseId);
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Get(":expenseId/revisions")
  @ApiOkResponse({ type: ExpenseRevisionPageResponseDto })
  revisions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Query() query: RevisionPageQueryDto,
  ) {
    return this.expenses.revisions(
      principal.userId,
      expenseId,
      query.cursor,
      query.limit,
    );
  }

  @Patch(":expenseId")
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() input: ExpenseInputDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.expenses.update(
      principal.userId,
      expenseId,
      this.parseVersion(ifMatch),
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Delete(":expenseId")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.expenses.remove(
      principal.userId,
      expenseId,
      this.parseVersion(ifMatch),
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Post(":expenseId/restore")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  async restore(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.expenses.restore(
      principal.userId,
      expenseId,
      this.parseVersion(ifMatch),
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  private parseVersion(value: string | undefined): number {
    const match = value?.match(/^(?:W\/)?"?(\d+)"?$/);
    if (!match) throw versionRequired();
    return Number(match[1]);
  }
}
