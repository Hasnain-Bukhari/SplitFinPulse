import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Environment } from "../config/environment";

interface TokenClaims {
  sub: string;
  sid: string;
  typ: "access" | "refresh";
  ver: number;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async access(
    userId: string,
    sessionId: string,
    version: number,
  ): Promise<string> {
    return this.sign({
      sub: userId,
      sid: sessionId,
      typ: "access",
      ver: version,
    });
  }

  async refresh(
    userId: string,
    sessionId: string,
    version: number,
  ): Promise<string> {
    return this.sign({
      sub: userId,
      sid: sessionId,
      typ: "refresh",
      ver: version,
    });
  }

  async verifyAccess(token: string): Promise<TokenClaims> {
    return this.verify(token, "access");
  }

  async verifyRefresh(token: string): Promise<TokenClaims> {
    return this.verify(token, "refresh");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  hashesMatch(token: string, expected: string): boolean {
    const actual = Buffer.from(this.hash(token));
    const stored = Buffer.from(expected);
    return actual.length === stored.length && timingSafeEqual(actual, stored);
  }

  csrf(): string {
    return randomBytes(32).toString("base64url");
  }

  private async sign(claims: TokenClaims): Promise<string> {
    const refresh = claims.typ === "refresh";
    return this.jwt.signAsync(claims, {
      secret: this.config.get(
        refresh ? "AUTH_REFRESH_SECRET" : "AUTH_ACCESS_SECRET",
        { infer: true },
      ),
      issuer: this.config.get("AUTH_ISSUER", { infer: true }),
      audience: this.config.get("AUTH_AUDIENCE", { infer: true }),
      expiresIn: this.config.get(
        refresh ? "AUTH_REFRESH_TTL_SECONDS" : "AUTH_ACCESS_TTL_SECONDS",
        { infer: true },
      ),
    });
  }

  private async verify(
    token: string,
    type: TokenClaims["typ"],
  ): Promise<TokenClaims> {
    const claims = await this.jwt.verifyAsync<TokenClaims>(token, {
      secret: this.config.get(
        type === "refresh" ? "AUTH_REFRESH_SECRET" : "AUTH_ACCESS_SECRET",
        { infer: true },
      ),
      issuer: this.config.get("AUTH_ISSUER", { infer: true }),
      audience: this.config.get("AUTH_AUDIENCE", { infer: true }),
    });
    if (claims.typ !== type || !claims.sub || !claims.sid)
      throw new Error("Invalid token");
    return claims;
  }
}
