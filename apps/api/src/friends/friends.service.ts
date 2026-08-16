import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import type { RequestDirection } from "./friends.dto";

const friendshipUsers = {
  firstUser: true,
  secondUser: true,
} satisfies Prisma.FriendshipInclude;

type FriendshipWithUsers = Prisma.FriendshipGetPayload<{
  include: typeof friendshipUsers;
}>;

interface CursorValue {
  updatedAt: string;
  id: string;
}

@Injectable()
export class FriendsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(userId: string, cursor: string | undefined, limit: number) {
    return this.listByStatus(userId, "ACCEPTED", undefined, cursor, limit);
  }

  async requests(
    userId: string,
    direction: RequestDirection,
    cursor: string | undefined,
    limit: number,
  ) {
    return this.listByStatus(userId, "PENDING", direction, cursor, limit);
  }

  async discover(userId: string, email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || user.status !== "ACTIVE") throw this.userNotFound();
    if (user.id === userId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "FRIENDSHIP_SELF",
        "You cannot add yourself as a friend",
      );
    }
    const friendship = await this.findPair(userId, user.id);
    return {
      user: this.presentUser(user),
      relationship: friendship
        ? {
            friendshipId: friendship.id,
            status: friendship.status,
            direction:
              friendship.requestedById === userId ? "outgoing" : "incoming",
          }
        : null,
    };
  }

  async discoverContacts(userId: string, emails: string[]) {
    const normalized = [
      ...new Set(emails.map((email) => email.trim().toLowerCase())),
    ].slice(0, 20);
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        status: "ACTIVE",
        email: { in: normalized },
      },
      orderBy: { name: "asc" },
    });
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { firstUserId: userId, secondUserId: { in: users.map((u) => u.id) } },
          { secondUserId: userId, firstUserId: { in: users.map((u) => u.id) } },
        ],
      },
    });
    return users.map((user) => {
      const friendship = friendships.find(
        (item) => item.firstUserId === user.id || item.secondUserId === user.id,
      );
      return {
        user: this.presentUser(user),
        relationship: friendship
          ? {
              friendshipId: friendship.id,
              status: friendship.status,
              direction:
                friendship.requestedById === userId ? "outgoing" : "incoming",
            }
          : null,
      };
    });
  }

  async request(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "FRIENDSHIP_SELF",
        "You cannot add yourself as a friend",
      );
    }
    const [firstUserId, secondUserId] = this.canonicalPair(
      userId,
      targetUserId,
    );
    try {
      const friendship = await this.prisma.withTransaction(async (database) => {
        const target = await database.user.findUnique({
          where: { id: targetUserId },
        });
        if (!target || target.status !== "ACTIVE") throw this.userNotFound();
        const existing = await database.friendship.findUnique({
          where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
        });
        if (existing && ["PENDING", "ACCEPTED"].includes(existing.status)) {
          return existing;
        }
        const now = new Date();
        return existing
          ? database.friendship.update({
              where: { id: existing.id },
              data: {
                requestedById: userId,
                status: "PENDING",
                acceptedAt: null,
                declinedAt: null,
                removedAt: null,
                updatedAt: now,
              },
            })
          : database.friendship.create({
              data: { firstUserId, secondUserId, requestedById: userId },
            });
      });
      return this.present(await this.load(friendship.id), userId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.friendship.findUniqueOrThrow({
          where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
          include: friendshipUsers,
        });
        return this.present(await this.load(existing.id), userId);
      }
      throw error;
    }
  }

  accept(userId: string, friendshipId: string) {
    return this.transitionRequest(userId, friendshipId, "ACCEPTED");
  }

  decline(userId: string, friendshipId: string) {
    return this.transitionRequest(userId, friendshipId, "DECLINED");
  }

  async remove(userId: string, friendshipId: string): Promise<void> {
    await this.prisma.withTransaction(async (database) => {
      const friendship = await database.friendship.findUnique({
        where: { id: friendshipId },
      });
      if (!friendship || !this.isParticipant(friendship, userId)) {
        throw this.friendshipNotFound();
      }
      if (friendship.status === "REMOVED") return;
      if (friendship.status !== "ACCEPTED") throw this.invalidState();
      await database.friendship.update({
        where: { id: friendship.id },
        data: { status: "REMOVED", removedAt: new Date() },
      });
    });
  }

  async acceptFromInvitation(
    database: Prisma.TransactionClient,
    inviterId: string,
    accepterId: string,
  ) {
    const [firstUserId, secondUserId] = this.canonicalPair(
      inviterId,
      accepterId,
    );
    const existing = await database.friendship.findUnique({
      where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
    });
    const now = new Date();
    const friendship = existing
      ? await database.friendship.update({
          where: { id: existing.id },
          data: {
            requestedById: inviterId,
            status: "ACCEPTED",
            acceptedAt: existing.acceptedAt ?? now,
            declinedAt: null,
            removedAt: null,
          },
        })
      : await database.friendship.create({
          data: {
            firstUserId,
            secondUserId,
            requestedById: inviterId,
            status: "ACCEPTED",
            acceptedAt: now,
          },
        });
    return friendship;
  }

  async presentById(friendshipId: string, userId: string) {
    return this.present(await this.load(friendshipId), userId);
  }

  private async transitionRequest(
    userId: string,
    friendshipId: string,
    target: "ACCEPTED" | "DECLINED",
  ) {
    const friendship = await this.prisma.withTransaction(async (database) => {
      const existing = await database.friendship.findUnique({
        where: { id: friendshipId },
      });
      if (!existing || !this.isParticipant(existing, userId)) {
        throw this.friendshipNotFound();
      }
      if (existing.requestedById === userId) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          "FRIENDSHIP_FORBIDDEN",
          "Only the request recipient can perform this action",
        );
      }
      if (existing.status === target) return existing;
      if (existing.status !== "PENDING") throw this.invalidState();
      const now = new Date();
      return database.friendship.update({
        where: { id: existing.id },
        data:
          target === "ACCEPTED"
            ? { status: target, acceptedAt: now, declinedAt: null }
            : { status: target, declinedAt: now, acceptedAt: null },
      });
    });
    return this.present(await this.load(friendship.id), userId);
  }

  private async listByStatus(
    userId: string,
    status: "PENDING" | "ACCEPTED",
    direction: RequestDirection | undefined,
    cursor: string | undefined,
    limit: number,
  ) {
    const decoded = cursor ? this.decodeCursor(cursor) : undefined;
    const participant: Prisma.FriendshipWhereInput = {
      OR: [{ firstUserId: userId }, { secondUserId: userId }],
    };
    const rows = await this.prisma.friendship.findMany({
      where: {
        AND: [
          participant,
          { status },
          ...(direction === "incoming"
            ? [{ requestedById: { not: userId } }]
            : direction === "outgoing"
              ? [{ requestedById: userId }]
              : []),
          ...(decoded
            ? [
                {
                  OR: [
                    { updatedAt: { lt: new Date(decoded.updatedAt) } },
                    {
                      updatedAt: new Date(decoded.updatedAt),
                      id: { lt: decoded.id },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      include: friendshipUsers,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((item) => this.present(item, userId)),
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                updatedAt: last.updatedAt.toISOString(),
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }

  private decodeCursor(value: string): CursorValue {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString(),
      ) as CursorValue;
      if (
        !parsed.id ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parsed.id,
        ) ||
        !parsed.updatedAt ||
        Number.isNaN(new Date(parsed.updatedAt).valueOf())
      ) {
        throw new Error("invalid");
      }
      return parsed;
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "The pagination cursor is invalid",
      );
    }
  }

  private async findPair(first: string, second: string) {
    const [firstUserId, secondUserId] = this.canonicalPair(first, second);
    return this.prisma.friendship.findUnique({
      where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
    });
  }

  private load(id: string): Promise<FriendshipWithUsers> {
    return this.prisma.friendship.findUniqueOrThrow({
      where: { id },
      include: friendshipUsers,
    });
  }

  private canonicalPair(first: string, second: string): [string, string] {
    return first < second ? [first, second] : [second, first];
  }

  private present(friendship: FriendshipWithUsers, currentUserId: string) {
    const counterpart =
      friendship.firstUserId === currentUserId
        ? friendship.secondUser
        : friendship.firstUser;
    return {
      friendshipId: friendship.id,
      user: this.presentUser(counterpart),
      status: friendship.status,
      direction:
        friendship.requestedById === currentUserId ? "outgoing" : "incoming",
      createdAt: friendship.createdAt,
      updatedAt: friendship.updatedAt,
      acceptedAt: friendship.acceptedAt,
    };
  }

  private presentUser(user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  }) {
    return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
  }

  private isParticipant(
    friendship: { firstUserId: string; secondUserId: string },
    userId: string,
  ): boolean {
    return (
      friendship.firstUserId === userId || friendship.secondUserId === userId
    );
  }

  private userNotFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      "USER_NOT_FOUND",
      "No active user was found",
    );
  }

  private friendshipNotFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      "FRIENDSHIP_NOT_FOUND",
      "The friendship was not found",
    );
  }

  private invalidState(): ApiException {
    return new ApiException(
      HttpStatus.CONFLICT,
      "FRIENDSHIP_STATE_INVALID",
      "The friendship is not in the required state",
    );
  }
}
