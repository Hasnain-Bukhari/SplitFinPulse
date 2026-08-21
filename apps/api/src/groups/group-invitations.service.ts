import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ActivitiesService,
  activityTypes,
} from "../activities/activities.service";
import { AuditService, auditActions } from "../audit/audit.service";
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
import { NotificationsService } from "../notifications/notifications.service";
import { groupEmailToken } from "../notifications/invitation-email";

@Injectable()
export class GroupInvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(GroupAccessService) private readonly access: GroupAccessService,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, groupId: string) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const token = groupEmailToken(
      this.config.get("FRIEND_INVITE_SECRET", { infer: true }),
      id,
      expiresAt,
    );
    const invitation = await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      if (!canEditGroup(membership.role)) throw groupForbidden();
      const created = await database.groupInvitation.create({
        data: {
          id,
          groupId,
          createdById: userId,
          tokenDigest: this.digestToken(token),
          expiresAt,
        },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.groupInvitationCreated,
        targetType: "GROUP_INVITATION",
        targetId: created.id,
      });
      return created;
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

  async createEmail(userId: string, groupId: string, email: string) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const token = groupEmailToken(
      this.config.get("FRIEND_INVITE_SECRET", { infer: true }),
      id,
      expiresAt,
    );
    await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      if (!canEditGroup(membership.role)) throw groupForbidden();
      await database.groupInvitation.create({
        data: {
          id,
          groupId,
          createdById: userId,
          tokenDigest: this.digestToken(token),
          expiresAt,
        },
      });
      await this.notifications.queueInvitationEmail(database, {
        email,
        kind: "GROUP",
        invitationId: id,
      });
    });
    return { accepted: true };
  }

  async list(
    userId: string,
    groupId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    limit ??= 20;
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
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.groupInvitationRevoked,
        targetType: "GROUP_INVITATION",
        targetId: invitation.id,
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
        const membership = await database.groupMember.create({
          data: { groupId: group.id, userId, role: "MEMBER" },
        });
        const members = await database.groupMember.findMany({
          where: { groupId: group.id, leftAt: null },
          select: { userId: true },
        });
        await this.activities.record(database, {
          type: activityTypes.groupMemberAdded,
          actorId: userId,
          entityType: "GROUP_MEMBER",
          entityId: membership.id,
          groupId: group.id,
          audienceUserIds: members.map((member) => member.userId),
          payload: { userId, memberName: user.name },
        });
        await this.audit.record(database, {
          actorId: userId,
          action: auditActions.groupMemberAdded,
          targetType: "GROUP_MEMBER",
          targetId: membership.id,
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
