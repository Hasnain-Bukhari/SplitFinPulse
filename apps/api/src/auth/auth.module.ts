import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./csrf.guard";
import { GoogleOidcService } from "./google-oidc.service";
import { TokenService } from "./token.service";
import { PrincipalThrottlerGuard } from "./principal-throttler.guard";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleOidcService,
    TokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
