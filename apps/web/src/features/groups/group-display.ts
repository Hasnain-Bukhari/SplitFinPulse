export const groupTypeLabels = {
  TRIP: "Trip",
  HOME: "Home",
  COUPLE: "Couple",
  OTHER: "Other",
} as const;

export const groupRoleLabels = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
} as const;

export function groupInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
