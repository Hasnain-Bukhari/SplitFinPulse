import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(
    userId: string,
    q: string,
    type: "ALL" | "EXPENSE" | "GROUP" | "PERSON",
    limit: number,
  ) {
    const term = q.trim();
    const include = (candidate: string) => type === "ALL" || type === candidate;
    const [expenses, groups, people] = await Promise.all([
      include("EXPENSE")
        ? this.prisma.expense.findMany({
            where: {
              status: "ACTIVE",
              currentRevision: {
                description: { contains: term, mode: "insensitive" },
              },
              OR: [
                {
                  friendship: {
                    OR: [{ firstUserId: userId }, { secondUserId: userId }],
                  },
                },
                { group: { memberships: { some: { userId, leftAt: null } } } },
                {
                  currentRevision: {
                    OR: [
                      { payers: { some: { userId } } },
                      { splits: { some: { userId } } },
                    ],
                  },
                },
              ],
            },
            include: { currentRevision: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: limit,
          })
        : [],
      include("GROUP")
        ? this.prisma.group.findMany({
            where: {
              status: "ACTIVE",
              name: { contains: term, mode: "insensitive" },
              memberships: { some: { userId, leftAt: null } },
            },
            select: { id: true, name: true, type: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: limit,
          })
        : [],
      include("PERSON")
        ? this.prisma.user.findMany({
            where: {
              id: { not: userId },
              status: "ACTIVE",
              name: { contains: term, mode: "insensitive" },
              OR: [
                {
                  friendshipsAsFirst: {
                    some: { secondUserId: userId, status: "ACCEPTED" },
                  },
                },
                {
                  friendshipsAsSecond: {
                    some: { firstUserId: userId, status: "ACCEPTED" },
                  },
                },
                {
                  groupMemberships: {
                    some: {
                      leftAt: null,
                      group: {
                        memberships: { some: { userId, leftAt: null } },
                      },
                    },
                  },
                },
              ],
            },
            select: { id: true, name: true, avatarUrl: true },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            take: limit,
          })
        : [],
    ]);
    return {
      expenses: expenses.flatMap((row) =>
        row.currentRevision
          ? [
              {
                type: "EXPENSE" as const,
                id: row.id,
                description: row.currentRevision.description,
                totalMinor: row.currentRevision.totalMinor.toString(),
                currency: row.currentRevision.currency,
                expenseDate: row.currentRevision.expenseDate
                  .toISOString()
                  .slice(0, 10),
                groupId: row.groupId,
                friendshipId: row.friendshipId,
              },
            ]
          : [],
      ),
      groups: groups.map((row) => ({
        type: "GROUP" as const,
        id: row.id,
        name: row.name,
        groupType: row.type,
      })),
      people: people.map((row) => ({ type: "PERSON" as const, ...row })),
    };
  }
}
