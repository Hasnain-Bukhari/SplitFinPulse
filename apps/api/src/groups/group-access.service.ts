import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import type { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { groupNotFound, memberNotFound } from "./group-errors";

type GroupDatabase = Prisma.TransactionClient | PrismaService;

@Injectable()
export class GroupAccessService {
  requireMembership(database: GroupDatabase, userId: string, groupId: string) {
    return database.groupMember
      .findFirst({ where: { groupId, userId, leftAt: null } })
      .then((membership) => {
        if (!membership) throw groupNotFound();
        return membership;
      });
  }

  requireMember(
    database: GroupDatabase,
    groupId: string,
    membershipId: string,
  ) {
    return database.groupMember
      .findFirst({ where: { id: membershipId, groupId, leftAt: null } })
      .then((membership) => {
        if (!membership) throw memberNotFound();
        return membership;
      });
  }

  requireActiveGroup(database: GroupDatabase, groupId: string) {
    return database.group
      .findUnique({ where: { id: groupId } })
      .then((group) => {
        if (!group) throw groupNotFound();
        if (group.status !== "ACTIVE") {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "GROUP_ARCHIVED",
            "Archived groups are read-only",
          );
        }
        return group;
      });
  }
}
