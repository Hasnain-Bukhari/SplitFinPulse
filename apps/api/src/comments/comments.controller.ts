import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import { versionRequired } from "../expenses/expense-errors";
import {
  CommentPageQueryDto,
  CommentPageResponseDto,
  CommentResponseDto,
  CreateCommentDto,
  UpdateCommentDto,
} from "./comments.dto";
import { CommentsService } from "./comments.service";

@ApiTags("Expense comments")
@ApiCookieAuth("sfp_access")
@ApiExtraModels(CreateCommentDto, UpdateCommentDto, CommentPageQueryDto)
@Controller("expenses/:expenseId/comments")
export class CommentsController {
  constructor(
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: CommentPageResponseDto })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Query() query: CommentPageQueryDto,
  ) {
    return this.comments.list(
      principal.userId,
      expenseId,
      query.cursor,
      query.limit,
    );
  }

  @Post()
  @ApiCreatedResponse({ type: CommentResponseDto })
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Body() input: CreateCommentDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.comments.create(
      principal.userId,
      expenseId,
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Patch(":commentId")
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: CommentResponseDto })
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() input: UpdateCommentDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.comments.update(
      principal.userId,
      expenseId,
      commentId,
      this.parseVersion(ifMatch),
      input,
    );
    response.setHeader("ETag", `"${result.version}"`);
    return result;
  }

  @Delete(":commentId")
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: CommentResponseDto })
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.comments.remove(
      principal.userId,
      expenseId,
      commentId,
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
