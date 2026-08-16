import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { GroupAccessService } from "./group-access.service";
import { decodeGroupCursor, encodeGroupCursor } from "./group-cursor";
import {
  groupForbidden,
  memberNotFound,
  ownerRequired,
  userNotFound,
} from "./group-errors";
import { canAssignRole, canManageMember } from "./group-permissions";
import { presentMember } from "./group-presenter";
import { GroupsService } from "./groups.service";
import type { AddGroupMemberDto, GroupRoleDto } from "./groups.dto";

@Injectable()
export class GroupMembershipsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GroupAccessService) private readonly access: GroupAccessService,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}

  async list(
    userId: string,
    groupId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    await this.access.requireMembership(this.prisma, userId, groupId);
    const decoded = cursor ? decodeGroupCursor(cursor) : undefined;
    const members = await this.prisma.groupMember.findMany({
      where: {
        groupId,
        leftAt: null,
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
      include: { user: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = members.length > limit;
    const items = members.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((member) => presentMember(member)),
      nextCursor:
        hasMore && last ? encodeGroupCursor(last.updatedAt, last.id) : null,
    };
  }

  async add(userId: string, groupId: string, input: AddGroupMemberDto) {
    let membershipId: string;
    try {
      membershipId = await this.prisma.withTransaction(async (database) => {
        const actor = await this.access.requireMembership(
          database,
          userId,
          groupId,
        );
        await this.access.requireActiveGroup(database, groupId);
        if (!canManageMember(actor.role, "MEMBER")) throw groupForbidden();
        const target = await database.user.findUnique({
          where: { id: input.userId },
        });
        if (!target || target.status !== "ACTIVE") throw userNotFound();
        const friendship = await database.friendship.findFirst({
          where: {
            status: "ACCEPTED",
            OR: [
              { firstUserId: userId, secondUserId: input.userId },
              { firstUserId: input.userId, secondUserId: userId },
            ],
          },
        });
        if (!friendship) {
          throw new ApiException(
            HttpStatus.FORBIDDEN,
            "GROUP_MEMBER_NOT_FRIEND",
            "Only accepted friends can be added directly",
          );
        }
        const existing = await database.groupMember.findFirst({
          where: { groupId, userId: input.userId, leftAt: null },
        });
        if (existing) return existing.id;
        const created = await database.groupMember.create({
          data: { groupId, userId: input.userId, role: "MEMBER" },
        });
        return created.id;
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.prisma.groupMember.findFirst({
        where: { groupId, userId: input.userId, leftAt: null },
      });
      if (!existing) throw error;
      membershipId = existing.id;
    }
    return this.byId(membershipId);
  }

  async updateRole(
    userId: string,
    groupId: string,
    membershipId: string,
    role: GroupRoleDto.ADMIN | GroupRoleDto.MEMBER,
  ) {
    await this.prisma.withTransaction(async (database) => {
      const actor = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      const target = await this.access.requireMember(
        database,
        groupId,
        membershipId,
      );
      if (!canManageMember(actor.role, target.role)) throw groupForbidden();
      if (target.role === role) return;
      if (target.role === "OWNER" || !canAssignRole(actor.role, role)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "GROUP_OWNERSHIP_TRANSFER_REQUIRED",
          "Use ownership transfer to change the owner role",
        );
      }
      await database.groupMember.update({
        where: { id: target.id },
        data: { role },
      });
    });
    return this.byId(membershipId);
  }

  async transferOwnership(
    userId: string,
    groupId: string,
    membershipId: string,
  ) {
    await this.prisma.withTransaction(async (database) => {
      const actor = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      if (actor.role !== "OWNER") throw groupForbidden();
      const target = await this.access.requireMember(
        database,
        groupId,
        membershipId,
      );
      if (target.id === actor.id) return;
      await database.groupMember.update({
        where: { id: actor.id },
        data: { role: "ADMIN" },
      });
      await database.groupMember.update({
        where: { id: target.id },
        data: { role: "OWNER" },
      });
    });
    return this.groups.detail(userId, groupId);
  }

  async remove(
    userId: string,
    groupId: string,
    membershipId: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (database) => {
      const actor = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      const target = await this.access.requireMember(
        database,
        groupId,
        membershipId,
      );
      if (target.userId === userId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "GROUP_LEAVE_REQUIRED",
          "Use the leave action to remove yourself",
        );
      }
      if (!canManageMember(actor.role, target.role)) throw groupForbidden();
      if (target.role === "OWNER") throw ownerRequired();
      await database.groupMember.update({
        where: { id: target.id },
        data: { leftAt: new Date() },
      });
    });
  }

  async leave(userId: string, groupId: string): Promise<void> {
    await this.prisma.withTransaction(async (database) => {
      const membership = await this.access.requireMembership(
        database,
        userId,
        groupId,
      );
      await this.access.requireActiveGroup(database, groupId);
      if (membership.role === "OWNER") throw ownerRequired();
      await database.groupMember.update({
        where: { id: membership.id },
        data: { leftAt: new Date() },
      });
    });
  }

  private async byId(membershipId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: { id: membershipId },
      include: { user: true },
    });
    if (!member || member.leftAt) throw memberNotFound();
    return presentMember(member);
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
