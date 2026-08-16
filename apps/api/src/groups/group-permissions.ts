export type GroupRoleValue = "OWNER" | "ADMIN" | "MEMBER";

export function canEditGroup(role: GroupRoleValue): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canArchiveGroup(role: GroupRoleValue): boolean {
  return role === "OWNER";
}

export function canManageMember(
  actorRole: GroupRoleValue,
  targetRole: GroupRoleValue,
): boolean {
  return (
    actorRole === "OWNER" || (actorRole === "ADMIN" && targetRole === "MEMBER")
  );
}

export function canAssignRole(
  actorRole: GroupRoleValue,
  targetRole: GroupRoleValue,
): boolean {
  return actorRole === "OWNER" && targetRole !== "OWNER";
}
