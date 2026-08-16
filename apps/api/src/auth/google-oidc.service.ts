import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { Environment } from "../config/environment";
import { ApiException } from "../http/api.exception";
import { HttpStatus } from "@nestjs/common";
import type { GoogleIdentityClaims } from "./auth.types";

@Injectable()
export class GoogleOidcService {
  private readonly client: OAuth2Client;
  private readonly clientId: string;
  private readonly redirectUri: string;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    this.clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
    this.redirectUri = config.get("GOOGLE_REDIRECT_URI", { infer: true });
    this.client = new OAuth2Client(
      this.clientId,
      config.get("GOOGLE_CLIENT_SECRET", { infer: true }),
      this.redirectUri,
    );
  }

  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    return this.client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      nonce: input.nonce,
      prompt: "select_account",
    });
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
    expectedNonce: string,
  ): Promise<GoogleIdentityClaims> {
    try {
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier,
        redirect_uri: this.redirectUri,
      });
      if (!tokens.id_token) throw new Error("Missing ID token");
      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.sub ||
        !payload.email ||
        payload.email_verified !== true ||
        payload.nonce !== expectedNonce
      ) {
        throw new Error("Invalid identity claims");
      }
      return {
        subject: payload.sub,
        email: payload.email,
        emailVerified: true,
        name: payload.name?.trim() || payload.email.split("@")[0] || "User",
        ...(payload.picture ? { avatarUrl: payload.picture } : {}),
        nonce: payload.nonce,
      };
    } catch {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_PROVIDER_REJECTED",
        "Google could not verify this sign-in attempt",
      );
    }
  }
}
