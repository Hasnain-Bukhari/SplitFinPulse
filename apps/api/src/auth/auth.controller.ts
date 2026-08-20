import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiCookieAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { Environment } from "../config/environment";
import { ApiException } from "../http/api.exception";
import type { RequestWithId } from "../http/request-id.middleware";
import { Public, SkipCsrf } from "../http/public.decorator";
import { AuthService } from "./auth.service";
import type { ApplicationTokens, AuthenticatedPrincipal } from "./auth.types";
import { CurrentPrincipal } from "./current-principal.decorator";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  @Public()
  @Get("google/start")
  @ApiQuery({ name: "returnTo", required: false })
  async start(
    @Query("returnTo") returnTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    response.redirect(await this.auth.begin(returnTo));
  }

  @Public()
  @Get("google/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!code || !state) {
      this.redirectAuthenticationError(response, "AUTH_PROVIDER_REJECTED");
      return;
    }
    try {
      const result = await this.auth.callback(
        code,
        state,
        request.headers["user-agent"],
        (request as RequestWithId).requestId,
      );
      this.setCookies(response, result.tokens);
      const destination = new URL(
        "/auth/callback",
        this.config.get("WEB_APP_URL", { infer: true }),
      );
      destination.searchParams.set("returnTo", result.returnTo);
      response.redirect(destination.toString());
    } catch (error) {
      const payload =
        error instanceof ApiException ? error.getResponse() : undefined;
      const codeValue =
        typeof payload === "object" &&
        "code" in payload &&
        typeof payload.code === "string"
          ? payload.code
          : "AUTH_PROVIDER_REJECTED";
      this.redirectAuthenticationError(response, codeValue);
    }
  }

  @ApiCookieAuth("sfp_access")
  @Get("session")
  session(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.auth.session(principal);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const refreshToken = request.cookies?.sfp_refresh as string | undefined;
    if (!refreshToken) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_SESSION_EXPIRED",
        "Your session has expired",
      );
    }
    const result = await this.auth.refresh(
      refreshToken,
      (request as RequestWithId).requestId,
    );
    this.setCookies(response, result.tokens);
    response.status(HttpStatus.OK).json(result.envelope);
  }

  @Post("logout")
  @ApiCookieAuth("sfp_access")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(principal, (request as RequestWithId).requestId);
    this.clearCookies(response);
  }

  @Get("sessions")
  @ApiCookieAuth("sfp_access")
  sessions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.auth.listSessions(principal);
  }

  @Delete("sessions/:sessionId")
  @ApiCookieAuth("sfp_access")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("sessionId") sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.revoke(
      principal,
      sessionId,
      (request as RequestWithId).requestId,
    );
    if (sessionId === principal.sessionId) this.clearCookies(response);
  }

  @Post("sessions/revoke-all")
  @ApiCookieAuth("sfp_access")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.revokeAll(principal, (request as RequestWithId).requestId);
    this.clearCookies(response);
  }

  @Post("reauthenticate")
  @ApiCookieAuth("sfp_access")
  @ApiQuery({ name: "returnTo", required: false })
  @HttpCode(HttpStatus.OK)
  async reauthenticate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query("returnTo") returnTo?: string,
  ) {
    return {
      authorizationUrl: await this.auth.begin(
        returnTo ?? "/settings/data",
        "REAUTHENTICATE",
        principal.sessionId,
      ),
    };
  }

  @Public()
  @SkipCsrf()
  @Post("reactivate")
  @ApiQuery({ name: "returnTo", required: false })
  @HttpCode(HttpStatus.OK)
  async reactivate(@Query("returnTo") returnTo?: string) {
    return {
      authorizationUrl: await this.auth.begin(returnTo ?? "/", "REACTIVATE"),
    };
  }

  private setCookies(response: Response, tokens: ApplicationTokens): void {
    const secure =
      this.config.get("NODE_ENV", { infer: true }) === "production";
    response.cookie("sfp_access", tokens.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge:
        this.config.get("AUTH_ACCESS_TTL_SECONDS", { infer: true }) * 1000,
    });
    response.cookie("sfp_refresh", tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/api/v1/auth",
      maxAge:
        this.config.get("AUTH_REFRESH_TTL_SECONDS", { infer: true }) * 1000,
    });
    response.cookie("sfp_csrf", tokens.csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge:
        this.config.get("AUTH_REFRESH_TTL_SECONDS", { infer: true }) * 1000,
    });
  }

  private clearCookies(response: Response): void {
    response.clearCookie("sfp_access", { path: "/" });
    response.clearCookie("sfp_refresh", { path: "/api/v1/auth" });
    response.clearCookie("sfp_csrf", { path: "/" });
  }

  private redirectAuthenticationError(response: Response, code: string): void {
    const path =
      code === "AUTH_ACCOUNT_DISABLED" ? "/account/reactivate" : "/login";
    const destination = new URL(
      path,
      this.config.get("WEB_APP_URL", { infer: true }),
    );
    destination.searchParams.set(
      "reason",
      code === "AUTH_ACCOUNT_DELETED" ? "account_deleted" : "sign_in_failed",
    );
    response.redirect(destination.toString());
  }
}
