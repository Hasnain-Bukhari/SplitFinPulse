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
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import type { CreateUploadIntentDto } from "./attachments.dto";
import { AttachmentsService } from "./attachments.service";

@ApiTags("Attachments")
@ApiCookieAuth("sfp_access")
@Controller()
export class AttachmentsController {
  constructor(
    @Inject(AttachmentsService)
    private readonly attachments: AttachmentsService,
  ) {}
  @Post("attachment-upload-intents") createIntent(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Body() input: CreateUploadIntentDto,
  ) {
    return this.attachments.createIntent(p.userId, input);
  }
  @Put("attachment-uploads/:attachmentId") upload(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("attachmentId", ParseUUIDPipe) id: string,
    @Headers("upload-token") token: string | undefined,
    @Req() request: Request,
  ) {
    return this.attachments.upload(p.userId, id, token ?? "", request);
  }
  @Get("expenses/:expenseId/attachments") list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("expenseId", ParseUUIDPipe) id: string,
  ) {
    return this.attachments.list(p.userId, id);
  }
  @Get("attachments/:attachmentId/extraction") extraction(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("attachmentId", ParseUUIDPipe) id: string,
  ) {
    return this.attachments.extraction(p.userId, id);
  }
  @Post("attachments/:attachmentId/extraction/retry") retry(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("attachmentId", ParseUUIDPipe) id: string,
  ) {
    return this.attachments.retry(p.userId, id);
  }
  @Post("attachments/:attachmentId/view-intents") viewIntent(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("attachmentId", ParseUUIDPipe) id: string,
  ) {
    return this.attachments.viewIntent(p.userId, id);
  }
  @Get("attachments/:attachmentId/content") async content(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("attachmentId", ParseUUIDPipe) id: string,
    @Query("expires") expires: string,
    @Query("token") token: string,
    @Res() response: Response,
  ) {
    const file = await this.attachments.content(p.userId, id, expires, token);
    response.setHeader("Content-Type", file.mime);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.send(file.data);
  }
  @Delete("attachments/:attachmentId") @HttpCode(HttpStatus.OK) remove(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param("attachmentId", ParseUUIDPipe) id: string,
  ) {
    return this.attachments.remove(p.userId, id);
  }
}
