import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthSession, User } from "../generated/prisma/client";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { presentSession, presentUser } from "./auth.presenter";
import type {
  ApplicationTokens,
  AuthenticatedPrincipal,
  GoogleIdentityClaims,
  SessionEnvelope,
} from "./auth.types";
import { GoogleOidcService } from "./google-oidc.service";
import { TokenService } from "./token.service";

type OidcIntent = "LOGIN" | "REAUTHENTICATE" | "REACTIVATE";

interface AuthResult {
  tokens: ApplicationTokens;
  returnTo: string;
  envelope: SessionEnvelope;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GoogleOidcService) private readonly google: GoogleOidcService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async begin(
    returnTo = "/",
    intent: OidcIntent = "LOGIN",
    sessionId?: string,
  ): Promise<string> {
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(64).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    await this.prisma.oidcTransaction.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.prisma.oidcTransaction.create({
      data: {
        stateHash: this.hash(state),
        codeVerifier: this.encrypt(verifier),
        nonce,
        intent,
        returnTo: this.safeReturnTo(returnTo),
        sessionId: sessionId ?? null,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return this.google.authorizationUrl({ state, nonce, codeChallenge });
  }

  async callback(
    code: string,
    state: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const transaction = await this.prisma.oidcTransaction.findUnique({
      where: { stateHash: this.hash(state) },
    });
    if (!transaction || transaction.expiresAt <= new Date()) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_PROVIDER_REJECTED",
        "This sign-in attempt is invalid or has expired",
      );
    }
    const claims = await this.google.exchangeCode(
      code,
      this.decrypt(transaction.codeVerifier),
      transaction.nonce,
    );
    const consumed = await this.prisma.oidcTransaction.deleteMany({
      where: { id: transaction.id },
    });
    if (consumed.count !== 1) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_PROVIDER_REJECTED",
        "This sign-in attempt has already been used",
      );
    }

    if (transaction.intent === "REAUTHENTICATE") {
      if (!transaction.sessionId) throw this.authRequired();
      return this.reauthenticate(
        claims,
        transaction.sessionId,
        transaction.returnTo,
      );
    }

    const user = await this.resolveUser(claims);
    if (transaction.intent === "REACTIVATE") {
      if (user.status !== "DEACTIVATED") {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "AUTH_ACCOUNT_DISABLED",
          "This account cannot be reactivated",
        );
      }
      await this.prisma.withTransaction(async (database) => {
        await database.user.update({
          where: { id: user.id },
          data: { status: "ACTIVE", deactivatedAt: null },
        });
        await database.accountLifecycleEvent.create({
          data: { userId: user.id, type: "REACTIVATED" },
        });
      });
      user.status = "ACTIVE";
      user.deactivatedAt = null;
    } else if (user.status !== "ACTIVE") {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "AUTH_ACCOUNT_DISABLED",
        "This account is not active",
      );
    }
    return this.createSession(user, userAgent, transaction.returnTo);
  }

  async session(principal: AuthenticatedPrincipal): Promise<SessionEnvelope> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: principal.sessionId },
      include: { user: true },
    });
    if (!session || session.userId !== principal.userId)
      throw this.authRequired();
    return {
      user: presentUser(session.user),
      session: presentSession(session, session.id),
    };
  }

  async validateAccess(token: string): Promise<AuthenticatedPrincipal> {
    try {
      const claims = await this.tokens.verifyAccess(token);
      const session = await this.prisma.authSession.findUnique({
        where: { id: claims.sid },
        include: { user: true },
      });
      const now = new Date();
      if (
        !session ||
        session.userId !== claims.sub ||
        session.tokenVersion !== claims.ver ||
        session.revokedAt ||
        session.absoluteExpiresAt <= now ||
        session.idleExpiresAt <= now ||
        session.user.status !== "ACTIVE"
      ) {
        throw new Error("Inactive session");
      }
      return { userId: claims.sub, sessionId: claims.sid };
    } catch {
      throw this.authRequired();
    }
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let claims: Awaited<ReturnType<TokenService["verifyRefresh"]>>;
    try {
      claims = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_SESSION_EXPIRED",
        "Your session has expired",
      );
    }
    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.user.status !== "ACTIVE" ||
      session.absoluteExpiresAt <= now ||
      session.idleExpiresAt <= now
    ) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_SESSION_EXPIRED",
        "Your session has expired",
      );
    }
    if (
      session.tokenVersion !== claims.ver ||
      !this.tokens.hashesMatch(refreshToken, session.refreshTokenHash)
    ) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: "REFRESH_REUSE" },
      });
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_SESSION_REVOKED",
        "This session has been revoked",
      );
    }
    return this.rotateSession(session, session.user, "/");
  }

  async listSessions(principal: AuthenticatedPrincipal) {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId: principal.userId,
        revokedAt: null,
        absoluteExpiresAt: { gt: new Date() },
        idleExpiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: "desc" },
    });
    return sessions.map((session) =>
      presentSession(session, principal.sessionId),
    );
  }

  async revoke(
    principal: AuthenticatedPrincipal,
    sessionId: string,
  ): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId: principal.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "USER_REVOKED" },
    });
    if (result.count !== 1) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "SESSION_NOT_FOUND",
        "Session not found",
      );
    }
  }

  async revokeAll(principal: AuthenticatedPrincipal): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId: principal.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "USER_REVOKED_ALL" },
    });
  }

  async logout(principal?: AuthenticatedPrincipal): Promise<void> {
    if (!principal) return;
    await this.prisma.authSession.updateMany({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
    });
  }

  private async resolveUser(claims: GoogleIdentityClaims): Promise<User> {
    const email = claims.email.trim().toLowerCase();
    try {
      return await this.prisma.withTransaction(async (database) => {
        const deletedIdentity = await database.deletedAuthIdentity.findUnique({
          where: {
            provider_subjectHash: {
              provider: "GOOGLE",
              subjectHash: this.identityFingerprint(claims.subject),
            },
          },
        });
        if (deletedIdentity) {
          throw new ApiException(
            HttpStatus.FORBIDDEN,
            "AUTH_ACCOUNT_DELETED",
            "This account was permanently deleted",
          );
        }
        const identity = await database.authIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider: "GOOGLE",
              providerSubject: claims.subject,
            },
          },
          include: { user: true },
        });
        if (identity) return identity.user;

        const existingUser = await database.user.findUnique({
          where: { email },
        });
        if (existingUser) {
          const existingIdentity = await database.authIdentity.findUnique({
            where: {
              userId_provider: { userId: existingUser.id, provider: "GOOGLE" },
            },
          });
          if (existingIdentity) throw this.identityConflict();
          await database.authIdentity.create({
            data: {
              userId: existingUser.id,
              provider: "GOOGLE",
              providerSubject: claims.subject,
              providerEmail: email,
            },
          });
          return existingUser;
        }

        return database.user.create({
          data: {
            email,
            name: claims.name.slice(0, 100),
            avatarUrl: claims.avatarUrl ?? null,
            providerAvatarUrl: claims.avatarUrl ?? null,
            identities: {
              create: {
                provider: "GOOGLE",
                providerSubject: claims.subject,
                providerEmail: email,
              },
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw this.identityConflict();
    }
  }

  private async createSession(
    user: User,
    userAgent: string | undefined,
    returnTo: string,
  ): Promise<AuthResult> {
    const id = randomUUID();
    const version = 1;
    const refreshToken = await this.tokens.refresh(user.id, id, version);
    const now = Date.now();
    const session = await this.prisma.authSession.create({
      data: {
        id,
        userId: user.id,
        refreshTokenHash: this.tokens.hash(refreshToken),
        tokenVersion: version,
        deviceDescription: this.device(userAgent),
        absoluteExpiresAt: new Date(
          now +
            this.config.get("AUTH_REFRESH_TTL_SECONDS", { infer: true }) * 1000,
        ),
        idleExpiresAt: new Date(
          now +
            this.config.get("AUTH_IDLE_TTL_SECONDS", { infer: true }) * 1000,
        ),
      },
    });
    return {
      tokens: {
        accessToken: await this.tokens.access(user.id, id, version),
        refreshToken,
        csrfToken: this.tokens.csrf(),
      },
      returnTo,
      envelope: {
        user: presentUser(user),
        session: presentSession(session, id),
      },
    };
  }

  private async rotateSession(
    session: AuthSession,
    user: User,
    returnTo: string,
  ): Promise<AuthResult> {
    const version = session.tokenVersion + 1;
    const refreshToken = await this.tokens.refresh(
      user.id,
      session.id,
      version,
    );
    const now = new Date();
    const idleExpiresAt = new Date(
      now.getTime() +
        this.config.get("AUTH_IDLE_TTL_SECONDS", { infer: true }) * 1000,
    );
    const rotation = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        tokenVersion: session.tokenVersion,
        refreshTokenHash: session.refreshTokenHash,
        revokedAt: null,
      },
      data: {
        tokenVersion: version,
        refreshTokenHash: this.tokens.hash(refreshToken),
        lastUsedAt: now,
        idleExpiresAt:
          idleExpiresAt < session.absoluteExpiresAt
            ? idleExpiresAt
            : session.absoluteExpiresAt,
      },
    });
    if (rotation.count !== 1) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: "REFRESH_REUSE" },
      });
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "AUTH_SESSION_REVOKED",
        "This session has been revoked",
      );
    }
    const updated = await this.prisma.authSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    return {
      tokens: {
        accessToken: await this.tokens.access(user.id, session.id, version),
        refreshToken,
        csrfToken: this.tokens.csrf(),
      },
      returnTo,
      envelope: {
        user: presentUser(user),
        session: presentSession(updated, session.id),
      },
    };
  }

  private async reauthenticate(
    claims: GoogleIdentityClaims,
    sessionId: string,
    returnTo: string,
  ): Promise<AuthResult> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: { include: { identities: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.user.status !== "ACTIVE" ||
      !session.user.identities.some(
        (identity) =>
          identity.provider === "GOOGLE" &&
          identity.providerSubject === claims.subject,
      )
    ) {
      throw this.authRequired();
    }
    const updated = await this.prisma.authSession.update({
      where: { id: session.id },
      data: { reauthenticatedAt: new Date() },
    });
    return this.rotateSession(updated, session.user, returnTo);
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private identityFingerprint(subject: string): string {
    return createHmac(
      "sha256",
      this.config.get("OIDC_TRANSACTION_SECRET", { infer: true }),
    )
      .update(`GOOGLE:${subject}`)
      .digest("hex");
  }

  private encrypt(value: string): string {
    const key = createHash("sha256")
      .update(this.config.get("OIDC_TRANSACTION_SECRET", { infer: true }))
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  private decrypt(value: string): string {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) throw this.authRequired();
    const key = createHash("sha256")
      .update(this.config.get("OIDC_TRANSACTION_SECRET", { infer: true }))
      .digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString();
  }

  private safeReturnTo(value: string): string {
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  }

  private device(userAgent?: string): string {
    const value = userAgent?.replaceAll(/[\r\n]/g, " ").trim();
    return value ? value.slice(0, 160) : "Unknown browser";
  }

  private authRequired(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      "AUTH_REQUIRED",
      "Authentication is required",
    );
  }

  private identityConflict(): ApiException {
    return new ApiException(
      HttpStatus.CONFLICT,
      "AUTH_IDENTITY_CONFLICT",
      "This Google identity conflicts with an existing account",
    );
  }
}
