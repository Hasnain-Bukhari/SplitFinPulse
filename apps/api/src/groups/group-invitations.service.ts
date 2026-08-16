import { createHash, randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client";
import type { Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { GroupAccessService } from "./group-access.service";
import { decodeGroupCursor, encodeGroupCursor } from "./group-cursor";
import {
  groupForbidden,
  invitationNotFound,
  userNotFound,
} from "./group-errors";
import { canEditGroup } from "./group-permissions";
import { presentUser } from "./group-presenter";
import { GroupsService } from "./groups.service";

@Injectable()
export class GroupInvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(GroupAccessService) private readonly access: GroupAccessService,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}

  async create(userId: string, groupId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const invitation = await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      if (!canEditGroup(membership.role)) throw groupForbidden();
      return database.groupInvitation.create({
        data: {
          groupId,
          createdById: userId,
          tokenDigest: this.digestToken(token),
          expiresAt,
        },
      });
    });
    const inviteUrl = new URL(
      `/group-invite/${token}`,
      this.config.get("WEB_APP_URL", { infer: true }),
    );
    return {
      invitationId: invitation.id,
      inviteUrl: inviteUrl.toString(),
      expiresAt: invitation.expiresAt,
    };
  }

  async list(
    userId: string,
    groupId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const membership = await this.access.requireMembership(
      this.prisma,
      userId,
      groupId,
    );
    if (!canEditGroup(membership.role)) throw groupForbidden();
    const decoded = cursor ? decodeGroupCursor(cursor) : undefined;
    const rows = await this.prisma.groupInvitation.findMany({
      where: {
        groupId,
        ...(decoded
          ? {
              OR: [
                { updatedAt: { lt: new Date(decoded.updatedAt) } },
                {
                  updatedAt: new Date(decoded.updatedAt),
                  id: { lt: decoded.id },
                },
              ],
            }
          : {}),
      },
      include: { createdBy: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((invitation) => ({
        invitationId: invitation.id,
        status: this.status(invitation),
        inviter: presentUser(invitation.createdBy),
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })),
      nextCursor:
        hasMore && last ? encodeGroupCursor(last.updatedAt, last.id) : null,
    };
  }

  async revoke(
    userId: string,
    groupId: string,
    invitationId: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      if (!canEditGroup(membership.role)) throw groupForbidden();
      const invitation = await database.groupInvitation.findFirst({
        where: { id: invitationId, groupId },
      });
      if (!invitation) throw invitationNotFound();
      if (invitation.revokedAt) return;
      await database.groupInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
    });
  }

  async preview(token: string) {
    const invitation = await this.load(token);
    return {
      status: this.status(invitation),
      group: { name: invitation.group.name, type: invitation.group.type },
      inviter: presentUser(invitation.createdBy),
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(userId: string, token: string) {
    const invitation = await this.load(token);
    if (invitation.revokedAt) {
      throw new ApiException(
        HttpStatus.GONE,
        "GROUP_INVITATION_REVOKED",
        "This group invitation has been revoked",
      );
    }
    if (invitation.expiresAt <= new Date()) {
      throw new ApiException(
        HttpStatus.GONE,
        "GROUP_INVITATION_EXPIRED",
        "This group invitation has expired",
      );
    }
    try {
      await this.prisma.withTransaction(async (database) => {
        const currentInvitation = await database.groupInvitation.findUnique({
          where: { id: invitation.id },
        });
        if (!currentInvitation || currentInvitation.revokedAt) {
          throw new ApiException(
            HttpStatus.GONE,
            "GROUP_INVITATION_REVOKED",
            "This group invitation has been revoked",
          );
        }
        if (currentInvitation.expiresAt <= new Date()) {
          throw new ApiException(
            HttpStatus.GONE,
            "GROUP_INVITATION_EXPIRED",
            "This group invitation has expired",
          );
        }
        const group = await this.access.requireActiveGroup(
          database,
          invitation.groupId,
        );
        const user = await database.user.findUnique({ where: { id: userId } });
        if (!user || user.status !== "ACTIVE") throw userNotFound();
        const existing = await database.groupMember.findFirst({
          where: { groupId: group.id, userId, leftAt: null },
        });
        if (existing) return;
        await database.groupMember.create({
          data: { groupId: group.id, userId, role: "MEMBER" },
        });
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.prisma.groupMember.findFirst({
        where: { groupId: invitation.groupId, userId, leftAt: null },
      });
      if (!existing) throw error;
    }
    return this.groups.detail(userId, invitation.groupId);
  }

  private async load(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invitationNotFound();
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { tokenDigest: this.digestToken(token) },
      include: { group: true, createdBy: true },
    });
    if (!invitation) throw invitationNotFound();
    return invitation;
  }

  private status(invitation: {
    expiresAt: Date;
    revokedAt: Date | null;
  }): "ACTIVE" | "EXPIRED" | "REVOKED" {
    if (invitation.revokedAt) return "REVOKED";
    return invitation.expiresAt <= new Date() ? "EXPIRED" : "ACTIVE";
  }

  private digestToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
