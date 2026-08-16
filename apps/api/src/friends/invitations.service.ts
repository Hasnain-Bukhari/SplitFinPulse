import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { FriendsService } from "./friends.service";

interface DecodedToken {
  id: string;
  expiresAt: Date;
  digest: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FriendsService) private readonly friends: FriendsService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async create(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE") throw this.authRequired();
    const id = randomUUID();
    const expiresAt = new Date(
      Date.now() +
        this.config.get("FRIEND_INVITE_TTL_SECONDS", { infer: true }) * 1000,
    );
    const unsigned = `${id}.${Math.floor(expiresAt.valueOf() / 1000)}.${randomBytes(24).toString("base64url")}`;
    const token = `${unsigned}.${this.sign(unsigned)}`;
    await this.prisma.friendInvitation.create({
      data: {
        id,
        inviterId: userId,
        tokenDigest: this.digest(token),
        expiresAt,
      },
    });
    const inviteUrl = new URL(
      `/invite/${token}`,
      this.config.get("WEB_APP_URL", { infer: true }),
    ).toString();
    return { inviteUrl, expiresAt };
  }

  async preview(token: string) {
    const decoded = this.decode(token);
    const invitation = await this.prisma.friendInvitation.findUnique({
      where: { id: decoded.id },
      include: { inviter: true },
    });
    if (!invitation || invitation.tokenDigest !== decoded.digest) {
      throw this.invalidInvite();
    }
    const status = invitation.consumedAt
      ? "USED"
      : invitation.revokedAt || invitation.inviter.status !== "ACTIVE"
        ? "REVOKED"
        : invitation.expiresAt <= new Date() || decoded.expiresAt <= new Date()
          ? "EXPIRED"
          : "ACTIVE";
    return {
      status,
      inviter: {
        name: invitation.inviter.name,
        avatarUrl: invitation.inviter.avatarUrl,
      },
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(token: string, userId: string) {
    const decoded = this.decode(token);
    const friendshipId = await this.prisma.withTransaction(async (database) => {
      const invitation = await database.friendInvitation.findUnique({
        where: { id: decoded.id },
        include: { inviter: true },
      });
      if (!invitation || invitation.tokenDigest !== decoded.digest) {
        throw this.invalidInvite();
      }
      const accepter = await database.user.findUnique({
        where: { id: userId },
      });
      if (!accepter || accepter.status !== "ACTIVE") throw this.authRequired();
      if (invitation.inviterId === userId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "FRIENDSHIP_SELF",
          "You cannot accept your own invitation",
        );
      }
      if (invitation.consumedAt) {
        if (invitation.acceptedById !== userId) throw this.usedInvite();
        const existing = await database.friendship.findFirst({
          where: {
            status: "ACCEPTED",
            OR: [
              { firstUserId: invitation.inviterId, secondUserId: userId },
              { firstUserId: userId, secondUserId: invitation.inviterId },
            ],
          },
        });
        if (!existing) throw this.usedInvite();
        return existing.id;
      }
      if (invitation.revokedAt || invitation.inviter.status !== "ACTIVE") {
        throw this.invalidInvite();
      }
      if (
        invitation.expiresAt <= new Date() ||
        decoded.expiresAt <= new Date()
      ) {
        throw new ApiException(
          HttpStatus.GONE,
          "INVITE_EXPIRED",
          "This invitation has expired",
        );
      }
      const friendship = await this.friends.acceptFromInvitation(
        database,
        invitation.inviterId,
        userId,
      );
      await database.friendInvitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date(), acceptedById: userId },
      });
      return friendship.id;
    });
    return this.friends.presentById(friendshipId, userId);
  }

  private decode(token: string): DecodedToken {
    try {
      const [id, expires, nonce, signature, extra] = token.split(".");
      if (
        extra ||
        !id ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ) ||
        !expires ||
        !nonce ||
        !signature
      ) {
        throw new Error("invalid");
      }
      const unsigned = `${id}.${expires}.${nonce}`;
      const expected = Buffer.from(this.sign(unsigned), "base64url");
      const received = Buffer.from(signature, "base64url");
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
      ) {
        throw new Error("invalid");
      }
      const epochSeconds = Number(expires);
      if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 1) {
        throw new Error("invalid");
      }
      return {
        id,
        expiresAt: new Date(epochSeconds * 1000),
        digest: this.digest(token),
      };
    } catch {
      throw this.invalidInvite();
    }
  }

  private sign(value: string): string {
    return createHmac(
      "sha256",
      this.config.get("FRIEND_INVITE_SECRET", { infer: true }),
    )
      .update(value)
      .digest("base64url");
  }

  private digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private invalidInvite(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      "INVITE_INVALID",
      "This invitation is not valid",
    );
  }

  private usedInvite(): ApiException {
    return new ApiException(
      HttpStatus.GONE,
      "INVITE_ALREADY_USED",
      "This invitation has already been used",
    );
  }

  private authRequired(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      "AUTH_REQUIRED",
      "Authentication is required",
    );
  }
}
