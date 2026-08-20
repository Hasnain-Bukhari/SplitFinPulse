import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";

type AuditDatabase = PrismaService | Prisma.TransactionClient;

export const auditActions = {
  loginSucceeded: "AUTH_LOGIN_SUCCEEDED",
  reauthenticated: "AUTH_REAUTHENTICATED",
  refreshReuseDetected: "AUTH_REFRESH_REUSE_DETECTED",
  sessionRevoked: "SESSION_REVOKED",
  allSessionsRevoked: "ALL_SESSIONS_REVOKED",
  loggedOut: "AUTH_LOGGED_OUT",
  profileUpdated: "PROFILE_UPDATED",
  accountDataExported: "ACCOUNT_DATA_EXPORTED",
  accountDeactivated: "ACCOUNT_DEACTIVATED",
  accountReactivated: "ACCOUNT_REACTIVATED",
  accountDeleted: "ACCOUNT_DELETED",
  groupRoleChanged: "GROUP_ROLE_CHANGED",
  groupCreated: "GROUP_CREATED",
  groupUpdated: "GROUP_UPDATED",
  groupMemberAdded: "GROUP_MEMBER_ADDED",
  groupMemberRemoved: "GROUP_MEMBER_REMOVED",
  groupMemberLeft: "GROUP_MEMBER_LEFT",
  groupOwnershipTransferred: "GROUP_OWNERSHIP_TRANSFERRED",
  groupInvitationCreated: "GROUP_INVITATION_CREATED",
  groupInvitationRevoked: "GROUP_INVITATION_REVOKED",
  groupArchived: "GROUP_ARCHIVED",
  groupRestored: "GROUP_RESTORED",
  groupDeleted: "GROUP_DELETED",
  expenseCreated: "EXPENSE_CREATED",
  expenseUpdated: "EXPENSE_UPDATED",
  expenseDeleted: "EXPENSE_DELETED",
  expenseRestored: "EXPENSE_RESTORED",
  settlementCreated: "SETTLEMENT_CREATED",
  settlementReplaced: "SETTLEMENT_REPLACED",
  settlementReversed: "SETTLEMENT_REVERSED",
  commentCreated: "COMMENT_CREATED",
  commentUpdated: "COMMENT_UPDATED",
  commentDeleted: "COMMENT_DELETED",
} as const;

export type AuditAction = (typeof auditActions)[keyof typeof auditActions];

export const personalSecurityActions: readonly AuditAction[] = [
  auditActions.loginSucceeded,
  auditActions.reauthenticated,
  auditActions.refreshReuseDetected,
  auditActions.sessionRevoked,
  auditActions.allSessionsRevoked,
  auditActions.loggedOut,
  auditActions.profileUpdated,
  auditActions.accountDataExported,
  auditActions.accountDeactivated,
  auditActions.accountReactivated,
  auditActions.accountDeleted,
];

export interface RecordAuditInput {
  actorId?: string;
  sessionId?: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  outcome?: "SUCCESS" | "DENIED" | "SECURITY_SIGNAL";
  requestId?: string;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  record(database: AuditDatabase, input: RecordAuditInput) {
    return database.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        sessionId: input.sessionId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        outcome: input.outcome ?? "SUCCESS",
        requestId: input.requestId ?? null,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });
  }

  async personalSecurityEvents(
    userId: string,
    cursorValue: string | undefined,
    limit: number,
  ) {
    limit ??= 20;
    const cursor = cursorValue ? this.decodeCursor(cursorValue) : undefined;
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        actorId: userId,
        action: { in: [...personalSecurityActions] },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        action: true,
        outcome: true,
        requestId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return {
      items,
      nextCursor: last ? this.encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id }),
      "utf8",
    ).toString("base64url");
  }

  private decodeCursor(value: string): { createdAt: Date; id: string } {
    try {
      const decoded = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as { createdAt: string; id: string };
      const createdAt = new Date(decoded.createdAt);
      if (
        Number.isNaN(createdAt.getTime()) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          decoded.id,
        )
      ) {
        throw new Error("invalid cursor");
      }
      return { createdAt, id: decoded.id };
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "Invalid cursor",
      );
    }
  }
}
