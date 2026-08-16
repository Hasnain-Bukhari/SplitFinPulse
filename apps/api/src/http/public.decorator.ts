import { SetMetadata } from "@nestjs/common";

export const PUBLIC_ROUTE = "public-route";
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE, true);

export const SKIP_CSRF = "skip-csrf";
export const SkipCsrf = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_CSRF, true);
