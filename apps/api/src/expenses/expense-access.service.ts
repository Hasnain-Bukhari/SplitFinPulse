import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { expenseNotFound } from "./expense-errors";

type Database = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ExpenseAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requireContext(
    database: Database,
    userId: string,
    groupId?: string,
    friendshipId?: string,
  ) {
    if ((groupId ? 1 : 0) + (friendshipId ? 1 : 0) !== 1)
      throw expenseNotFound();
    if (groupId) {
      const group = await database.group.findFirst({
        where: {
          id: groupId,
          status: "ACTIVE",
          memberships: { some: { userId, leftAt: null } },
        },
        include: {
          memberships: { where: { leftAt: null }, select: { userId: true } },
        },
      });
      if (!group) throw expenseNotFound();
      return {
        groupId,
        friendshipId: undefined,
        userIds: group.memberships.map((m) => m.userId),
        group,
      };
    }
    const friendship = await database.friendship.findFirst({
      where: {
        id: friendshipId!,
        status: "ACCEPTED",
        OR: [{ firstUserId: userId }, { secondUserId: userId }],
      },
    });
    if (!friendship) throw expenseNotFound();
    return {
      groupId: undefined,
      friendshipId,
      userIds: [friendship.firstUserId, friendship.secondUserId],
      group: undefined,
    };
  }

  async requireReadable(userId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        OR: [
          {
            friendship: {
              OR: [{ firstUserId: userId }, { secondUserId: userId }],
            },
          },
          { group: { memberships: { some: { userId, leftAt: null } } } },
          {
            revisions: {
              some: {
                OR: [
                  { payers: { some: { userId } } },
                  { splits: { some: { userId } } },
                ],
              },
            },
          },
        ],
      },
    });
    if (!expense) throw expenseNotFound();
    return expense;
  }

  async requireManageable(
    database: Prisma.TransactionClient,
    userId: string,
    expenseId: string,
  ) {
    const expense = await database.expense.findUnique({
      where: { id: expenseId },
    });
    if (!expense) throw expenseNotFound();
    await this.requireContext(
      database,
      userId,
      expense.groupId ?? undefined,
      expense.friendshipId ?? undefined,
    );
    if (expense.creatorId === userId) return expense;
    if (expense.groupId) {
      const member = await database.groupMember.findFirst({
        where: {
          groupId: expense.groupId,
          userId,
          leftAt: null,
          role: { in: ["OWNER", "ADMIN"] },
        },
      });
      if (member) return expense;
    }
    throw expenseNotFound();
  }
}
