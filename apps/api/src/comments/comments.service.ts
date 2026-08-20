import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import {
  ActivitiesService,
  activityTypes,
} from "../activities/activities.service";
import { AuditService, auditActions } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { ExpenseAccessService } from "../expenses/expense-access.service";
import { expenseNotFound } from "../expenses/expense-errors";
import { ApiException } from "../http/api.exception";
import type { CreateCommentDto, UpdateCommentDto } from "./comments.dto";

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExpenseAccessService)
    private readonly expenseAccess: ExpenseAccessService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    userId: string,
    expenseId: string,
    cursorValue: string | undefined,
    limit: number,
  ) {
    limit ??= 20;
    await this.expenseAccess.requireReadable(userId, expenseId);
    const writable = await this.canWrite(userId, expenseId);
    const cursor = cursorValue ? this.decodeCursor(cursorValue) : undefined;
    const rows = await this.prisma.expenseComment.findMany({
      where: {
        expenseId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const items = rows
      .slice(0, limit)
      .map((row) => this.present(row, userId, writable));
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return {
      items,
      nextCursor: last ? this.encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, expenseId: string, input: CreateCommentDto) {
    const commentId = await this.prisma.withTransaction(async (database) => {
      const context = await this.requireWritable(database, userId, expenseId);
      const comment = await database.expenseComment.create({
        data: { expenseId, authorId: userId, body: input.body.trim() },
      });
      await this.activities.record(database, {
        type: activityTypes.commentCreated,
        actorId: userId,
        entityType: "COMMENT",
        entityId: comment.id,
        ...(context.groupId ? { groupId: context.groupId } : {}),
        ...(context.friendshipId ? { friendshipId: context.friendshipId } : {}),
        audienceUserIds: context.audienceUserIds,
        payload: { expenseId, description: context.description },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.commentCreated,
        targetType: "COMMENT",
        targetId: comment.id,
      });
      return comment.id;
    });
    return this.detail(userId, expenseId, commentId);
  }

  async update(
    userId: string,
    expenseId: string,
    commentId: string,
    version: number,
    input: UpdateCommentDto,
  ) {
    await this.prisma.withTransaction(async (database) => {
      const context = await this.requireWritable(database, userId, expenseId);
      const existing = await database.expenseComment.findFirst({
        where: { id: commentId, expenseId, authorId: userId, deletedAt: null },
      });
      if (!existing) throw this.notFound();
      if (existing.version !== version) throw this.stale();
      const changed = await database.expenseComment.updateMany({
        where: { id: commentId, version, deletedAt: null },
        data: { body: input.body.trim(), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw this.stale();
      await this.activities.record(database, {
        type: activityTypes.commentUpdated,
        actorId: userId,
        entityType: "COMMENT",
        entityId: commentId,
        ...(context.groupId ? { groupId: context.groupId } : {}),
        ...(context.friendshipId ? { friendshipId: context.friendshipId } : {}),
        audienceUserIds: context.audienceUserIds,
        payload: { expenseId, description: context.description },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.commentUpdated,
        targetType: "COMMENT",
        targetId: commentId,
      });
    });
    return this.detail(userId, expenseId, commentId);
  }

  async remove(
    userId: string,
    expenseId: string,
    commentId: string,
    version: number,
  ) {
    await this.prisma.withTransaction(async (database) => {
      const context = await this.requireWritable(database, userId, expenseId);
      const existing = await database.expenseComment.findFirst({
        where: { id: commentId, expenseId, authorId: userId, deletedAt: null },
      });
      if (!existing) throw this.notFound();
      if (existing.version !== version) throw this.stale();
      const changed = await database.expenseComment.updateMany({
        where: { id: commentId, version, deletedAt: null },
        data: {
          body: null,
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw this.stale();
      await this.activities.record(database, {
        type: activityTypes.commentDeleted,
        actorId: userId,
        entityType: "COMMENT",
        entityId: commentId,
        ...(context.groupId ? { groupId: context.groupId } : {}),
        ...(context.friendshipId ? { friendshipId: context.friendshipId } : {}),
        audienceUserIds: context.audienceUserIds,
        payload: { expenseId, description: context.description },
      });
      await this.audit.record(database, {
        actorId: userId,
        action: auditActions.commentDeleted,
        targetType: "COMMENT",
        targetId: commentId,
      });
    });
    return this.detail(userId, expenseId, commentId);
  }

  private async detail(userId: string, expenseId: string, commentId: string) {
    await this.expenseAccess.requireReadable(userId, expenseId);
    const comment = await this.prisma.expenseComment.findFirst({
      where: { id: commentId, expenseId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    if (!comment) throw this.notFound();
    return this.present(
      comment,
      userId,
      await this.canWrite(userId, expenseId),
    );
  }

  private async requireWritable(
    database: Prisma.TransactionClient,
    userId: string,
    expenseId: string,
  ) {
    const expense = await database.expense.findUnique({
      where: { id: expenseId },
      include: {
        currentRevision: { select: { description: true } },
        group: {
          select: {
            status: true,
            memberships: {
              where: { leftAt: null },
              select: { userId: true },
            },
          },
        },
        friendship: true,
      },
    });
    if (!expense?.currentRevision || expense.status !== "ACTIVE") {
      throw expenseNotFound();
    }
    if (expense.groupId && expense.group?.status === "ACTIVE") {
      const userIds = expense.group.memberships.map((row) => row.userId);
      if (!userIds.includes(userId)) throw expenseNotFound();
      return {
        groupId: expense.groupId,
        friendshipId: null,
        description: expense.currentRevision.description,
        audienceUserIds: userIds,
      };
    }
    if (
      expense.friendshipId &&
      expense.friendship?.status === "ACCEPTED" &&
      (expense.friendship.firstUserId === userId ||
        expense.friendship.secondUserId === userId)
    ) {
      return {
        groupId: null,
        friendshipId: expense.friendshipId,
        description: expense.currentRevision.description,
        audienceUserIds: [
          expense.friendship.firstUserId,
          expense.friendship.secondUserId,
        ],
      };
    }
    throw expenseNotFound();
  }

  private present(
    comment: {
      id: string;
      expenseId: string;
      body: string | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
      authorId: string;
      author: { id: string; name: string; avatarUrl: string | null };
    },
    userId: string,
    writable: boolean,
  ) {
    const canManage =
      writable && comment.authorId === userId && comment.deletedAt === null;
    return {
      id: comment.id,
      expenseId: comment.expenseId,
      author: comment.author,
      body: comment.deletedAt ? null : comment.body,
      version: comment.version,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      deletedAt: comment.deletedAt,
      permissions: { canEdit: canManage, canDelete: canManage },
    };
  }

  private async canWrite(userId: string, expenseId: string): Promise<boolean> {
    try {
      await this.prisma.withTransaction((database) =>
        this.requireWritable(database, userId, expenseId),
      );
      return true;
    } catch (error) {
      if (error instanceof ApiException) return false;
      throw error;
    }
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

  private notFound() {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      "COMMENT_NOT_FOUND",
      "Comment not found",
    );
  }

  private stale() {
    return new ApiException(
      HttpStatus.PRECONDITION_FAILED,
      "STALE_VERSION",
      "Comment has changed",
    );
  }
}
