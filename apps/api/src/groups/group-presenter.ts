import {
  canArchiveGroup,
  canEditGroup,
  type GroupRoleValue,
} from "./group-permissions";

interface PresentableUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface PresentableMember {
  id: string;
  role: GroupRoleValue;
  joinedAt: Date;
  leftAt: Date | null;
  user: PresentableUser;
}

interface PresentableGroup {
  id: string;
  name: string;
  type: "TRIP" | "HOME" | "COUPLE" | "OTHER";
  status: "ACTIVE" | "ARCHIVED";
  defaultCurrency: string;
  simplifyDebtsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export function presentGroup(
  group: PresentableGroup,
  role: GroupRoleValue,
  memberCount: number,
  membershipHistoryCount: number,
) {
  const active = group.status === "ACTIVE";
  return {
    id: group.id,
    name: group.name,
    type: group.type,
    status: group.status,
    defaultCurrency: group.defaultCurrency,
    simplifyDebtsEnabled: group.simplifyDebtsEnabled,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    archivedAt: group.archivedAt,
    currentUserRole: role,
    memberCount,
    permissions: {
      canEdit: active && canEditGroup(role),
      canManageMembers: active && canEditGroup(role),
      canCreateInvitations: active && canEditGroup(role),
      canArchive: active && canArchiveGroup(role),
      canRestore: !active && canArchiveGroup(role),
      canDelete:
        !active && canArchiveGroup(role) && membershipHistoryCount === 1,
      canLeave: active && role !== "OWNER",
      canTransferOwnership: active && role === "OWNER" && memberCount > 1,
      canManageRoles: active && role === "OWNER",
    },
  };
}

export function presentMember(member: PresentableMember) {
  return {
    membershipId: member.id,
    user: presentUser(member.user),
    role: member.role,
    joinedAt: member.joinedAt,
    leftAt: member.leftAt,
  };
}

export function presentUser(user: PresentableUser) {
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
}
