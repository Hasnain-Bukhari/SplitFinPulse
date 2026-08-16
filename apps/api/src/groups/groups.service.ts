import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { isSupportedCurrencyCode } from "../currencies/currency-codes";
import { ApiException } from "../http/api.exception";
import { GroupAccessService } from "./group-access.service";
import { decodeGroupCursor, encodeGroupCursor } from "./group-cursor";
import { groupForbidden, groupNotFound } from "./group-errors";
import { canArchiveGroup, canEditGroup } from "./group-permissions";
import { presentGroup, presentMember } from "./group-presenter";
import type {
  CreateGroupDto,
  GroupStatusDto,
  UpdateGroupDto,
} from "./groups.dto";

@Injectable()
export class GroupsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GroupAccessService) private readonly access: GroupAccessService,
  ) {}

  async list(
    userId: string,
    status: GroupStatusDto | undefined,
    cursor: string | undefined,
    limit: number,
  ) {
    const decoded = cursor ? decodeGroupCursor(cursor) : undefined;
    const rows = await this.prisma.groupMember.findMany({
      where: {
        userId,
        leftAt: null,
        group: {
          ...(status ? { status } : {}),
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
      },
      include: { group: true },
      orderBy: [{ group: { updatedAt: "desc" } }, { groupId: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const groupIds = items.map((membership) => membership.groupId);
    const [activeCounts, historyCounts] = await Promise.all([
      this.prisma.groupMember.groupBy({
        by: ["groupId"],
        where: { groupId: { in: groupIds }, leftAt: null },
        _count: { _all: true },
      }),
      this.prisma.groupMember.groupBy({
        by: ["groupId"],
        where: { groupId: { in: groupIds } },
        _count: { _all: true },
      }),
    ]);
    const activeByGroup = new Map(
      activeCounts.map((count) => [count.groupId, count._count._all]),
    );
    const historyByGroup = new Map(
      historyCounts.map((count) => [count.groupId, count._count._all]),
    );
    return {
      items: items.map((membership) =>
        presentGroup(
          membership.group,
          membership.role,
          activeByGroup.get(membership.groupId) ?? 0,
          historyByGroup.get(membership.groupId) ?? 0,
        ),
      ),
      nextCursor:
        hasMore && last
          ? encodeGroupCursor(last.group.updatedAt, last.group.id)
          : null,
    };
  }

  async create(userId: string, input: CreateGroupDto) {
    this.validateCurrency(input.defaultCurrency);
    const group = await this.prisma.withTransaction((database) =>
      database.group.create({
        data: {
          name: input.name.trim(),
          type: input.type,
          defaultCurrency: input.defaultCurrency,
          simplifyDebtsEnabled: input.simplifyDebtsEnabled ?? false,
          createdById: userId,
          memberships: { create: { userId, role: "OWNER" } },
        },
      }),
    );
    return this.detail(userId, group.id);
  }

  async detail(userId: string, groupId: string) {
    const membership = await this.access.requireMembership(
      this.prisma,
      userId,
      groupId,
    );
    const [group, activeMemberCount] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          _count: { select: { memberships: true } },
          memberships: {
            where: { leftAt: null },
            include: { user: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 21,
          },
        },
      }),
      this.prisma.groupMember.count({ where: { groupId, leftAt: null } }),
    ]);
    if (!group) throw groupNotFound();
    const hasMoreMembers = group.memberships.length > 20;
    const members = group.memberships.slice(0, 20);
    const lastMember = members.at(-1);
    return {
      ...presentGroup(
        group,
        membership.role,
        activeMemberCount,
        group._count.memberships,
      ),
      members: members.map((member) => presentMember(member)),
      membersNextCursor:
        hasMoreMembers && lastMember
          ? encodeGroupCursor(lastMember.updatedAt, lastMember.id)
          : null,
    };
  }

  async update(userId: string, groupId: string, input: UpdateGroupDto) {
    if (input.defaultCurrency) this.validateCurrency(input.defaultCurrency);
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "At least one group setting is required",
      );
    }
    await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      const group = await this.access.requireActiveGroup(database, groupId);
      if (!canEditGroup(membership.role)) throw groupForbidden();
      await database.group.update({
        where: { id: group.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.defaultCurrency !== undefined
            ? { defaultCurrency: input.defaultCurrency }
            : {}),
          ...(input.simplifyDebtsEnabled !== undefined
            ? { simplifyDebtsEnabled: input.simplifyDebtsEnabled }
            : {}),
        },
      });
    });
    return this.detail(userId, groupId);
  }

  archive(userId: string, groupId: string) {
    return this.setArchived(userId, groupId, true);
  }

  restore(userId: string, groupId: string) {
    return this.setArchived(userId, groupId, false);
  }

  async removeGroup(userId: string, groupId: string): Promise<void> {
    await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      const group = await database.group.findUnique({ where: { id: groupId } });
      if (!group) throw groupNotFound();
      if (membership.role !== "OWNER") throw groupForbidden();
      if (group.status !== "ARCHIVED") {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "GROUP_DELETE_UNSAFE",
          "Archive the group before deleting it",
        );
      }
      const membershipHistoryCount = await database.groupMember.count({
        where: { groupId },
      });
      if (membershipHistoryCount !== 1) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "GROUP_DELETE_UNSAFE",
          "Groups with membership history cannot be permanently deleted",
        );
      }
      await database.groupInvitation.deleteMany({ where: { groupId } });
      await database.groupMember.deleteMany({ where: { groupId } });
      await database.group.delete({ where: { id: groupId } });
    });
  }

  private async setArchived(
    userId: string,
    groupId: string,
    archived: boolean,
  ) {
    await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      if (!canArchiveGroup(membership.role)) throw groupForbidden();
      const group = await database.group.findUnique({ where: { id: groupId } });
      if (!group) throw groupNotFound();
      const targetStatus = archived ? "ARCHIVED" : "ACTIVE";
      if (group.status === targetStatus) return;
      const now = new Date();
      await database.group.update({
        where: { id: groupId },
        data: {
          status: targetStatus,
          archivedAt: archived ? now : null,
        },
      });
      if (archived) {
        await database.groupInvitation.updateMany({
          where: { groupId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });
    return this.detail(userId, groupId);
  }

  private validateCurrency(currency: string): void {
    if (!isSupportedCurrencyCode(currency)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURRENCY",
        "Unsupported currency code",
      );
    }
  }
}
