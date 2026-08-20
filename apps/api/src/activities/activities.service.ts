import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";

type ActivityDatabase = PrismaService | Prisma.TransactionClient;

export const activityTypes = {
  expenseCreated: "EXPENSE_CREATED",
  expenseUpdated: "EXPENSE_UPDATED",
  expenseDeleted: "EXPENSE_DELETED",
  expenseRestored: "EXPENSE_RESTORED",
  groupCreated: "GROUP_CREATED",
  groupUpdated: "GROUP_UPDATED",
  groupArchived: "GROUP_ARCHIVED",
  groupRestored: "GROUP_RESTORED",
  groupMemberAdded: "GROUP_MEMBER_ADDED",
  groupMemberRoleUpdated: "GROUP_MEMBER_ROLE_UPDATED",
  groupMemberRemoved: "GROUP_MEMBER_REMOVED",
  groupMemberLeft: "GROUP_MEMBER_LEFT",
  groupOwnershipTransferred: "GROUP_OWNERSHIP_TRANSFERRED",
  settlementCreated: "SETTLEMENT_CREATED",
  settlementReplaced: "SETTLEMENT_REPLACED",
  settlementReversed: "SETTLEMENT_REVERSED",
  commentCreated: "COMMENT_CREATED",
  commentUpdated: "COMMENT_UPDATED",
  commentDeleted: "COMMENT_DELETED",
} as const;

export interface RecordActivityInput {
  type: (typeof activityTypes)[keyof typeof activityTypes];
  actorId?: string;
  entityType: "EXPENSE" | "GROUP" | "GROUP_MEMBER" | "SETTLEMENT" | "COMMENT";
  entityId: string;
  groupId?: string;
  friendshipId?: string;
  payload?: Prisma.InputJsonObject;
  audienceUserIds: readonly string[];
  occurredAt?: Date;
}

@Injectable()
export class ActivitiesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(database: ActivityDatabase, input: RecordActivityInput) {
    const event = await database.activityEvent.create({
      data: {
        type: input.type,
        actorId: input.actorId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        groupId: input.groupId ?? null,
        friendshipId: input.friendshipId ?? null,
        payload: input.payload ?? {},
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      },
    });
    const userIds = [...new Set(input.audienceUserIds)];
    if (userIds.length > 0) {
      await database.activityAudience.createMany({
        data: userIds.map((userId) => ({ eventId: event.id, userId })),
        skipDuplicates: true,
      });
    }
    return event;
  }

  async personal(userId: string, cursor: string | undefined, limit: number) {
    return this.page({ audiences: { some: { userId } } }, cursor, limit);
  }

  async group(
    userId: string,
    groupId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, userId, leftAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "GROUP_NOT_FOUND",
        "Group not found",
      );
    }
    return this.page({ groupId }, cursor, limit);
  }

  private async page(
    where: Prisma.ActivityEventWhereInput,
    cursorValue: string | undefined,
    limit: number,
  ) {
    limit ??= 20;
    const cursor = cursorValue ? this.decodeCursor(cursorValue) : undefined;
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { occurredAt: { lt: cursor.occurredAt } },
                {
                  occurredAt: cursor.occurredAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      include: {
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map((row) => ({
      id: row.id,
      type: row.type,
      actor: row.actor,
      entityType: row.entityType,
      entityId: row.entityId,
      groupId: row.groupId,
      friendshipId: row.friendshipId,
      payloadVersion: row.payloadVersion,
      payload: row.payload,
      occurredAt: row.occurredAt,
    }));
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return {
      items,
      nextCursor: last ? this.encodeCursor(last.occurredAt, last.id) : null,
    };
  }

  private encodeCursor(occurredAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ occurredAt: occurredAt.toISOString(), id }),
      "utf8",
    ).toString("base64url");
  }

  private decodeCursor(value: string): { occurredAt: Date; id: string } {
    try {
      const decoded = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as { occurredAt: string; id: string };
      const occurredAt = new Date(decoded.occurredAt);
      if (
        Number.isNaN(occurredAt.getTime()) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          decoded.id,
        )
      ) {
        throw new Error("invalid cursor");
      }
      return { occurredAt, id: decoded.id };
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "Invalid cursor",
      );
    }
  }
}
