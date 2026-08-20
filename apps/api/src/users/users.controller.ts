import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { RequestWithId } from "../http/request-id.middleware";
import { DeleteAccountDto, UpdateProfileDto } from "./user.dto";
import { UsersService } from "./users.service";

@ApiTags("Account")
@ApiCookieAuth("sfp_access")
@Controller("users/me")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.users.me(principal.userId);
  }

  @Patch()
  @ApiBody({ type: UpdateProfileDto })
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: UpdateProfileDto,
    @Req() request: Request,
  ) {
    return this.users.update(
      principal.userId,
      input,
      (request as RequestWithId).requestId,
    );
  }

  @Get("preference-options")
  preferenceOptions() {
    return this.users.preferenceOptions();
  }

  @Post("export")
  @HttpCode(HttpStatus.OK)
  async exportAccount(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.users.exportAccount(
      principal,
      (request as RequestWithId).requestId,
    );
    response
      .status(HttpStatus.OK)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="splitfinpulse-account-${principal.userId}.json"`,
      )
      .send(JSON.stringify(data, null, 2));
  }

  @Post("deactivate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.users.deactivate(
      principal,
      (request as RequestWithId).requestId,
    );
    this.clearCookies(response);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: DeleteAccountDto })
  async deleteAccount(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: DeleteAccountDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    void input;
    await this.users.delete(principal, (request as RequestWithId).requestId);
    this.clearCookies(response);
  }

  private clearCookies(response: Response): void {
    response.clearCookie("sfp_access", { path: "/" });
    response.clearCookie("sfp_refresh", { path: "/api/v1/auth" });
    response.clearCookie("sfp_csrf", { path: "/" });
  }
}
