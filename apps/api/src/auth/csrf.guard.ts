import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Environment } from "../config/environment";
import { ApiException } from "../http/api.exception";
import { SKIP_CSRF } from "../http/public.decorator";

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) config: ConfigService<Environment, true>,
  ) {
    this.allowedOrigins = new Set(
      config
        .get("CORS_ORIGINS", { infer: true })
        .split(",")
        .map((origin) => origin.trim()),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || skip)
      return true;

    const origin = request.headers.origin;
    const csrfCookie = request.cookies?.sfp_csrf as string | undefined;
    const csrfHeader = request.headers["x-csrf-token"];
    if (
      !origin ||
      !this.allowedOrigins.has(origin) ||
      !csrfCookie ||
      typeof csrfHeader !== "string" ||
      csrfCookie !== csrfHeader
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "AUTH_CSRF_INVALID",
        "The request could not be verified",
      );
    }
    return true;
  }
}
