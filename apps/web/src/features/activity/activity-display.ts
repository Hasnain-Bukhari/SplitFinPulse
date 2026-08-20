import type { ActivityEvent } from "@/lib/api/client";

export function activityText(event: ActivityEvent): string {
  const actor = event.actor?.name ?? "SplitFinPulse";
  const text = (key: string, fallback: string): string =>
    typeof event.payload[key] === "string"
      ? (event.payload[key] as string)
      : fallback;
  const subject = text("description", text("groupName", "an item"));
  const member = text("memberName", "a member");
  switch (event.type) {
    case "EXPENSE_CREATED":
      return `${actor} added ${subject}`;
    case "EXPENSE_UPDATED":
      return `${actor} updated ${subject}`;
    case "EXPENSE_DELETED":
      return `${actor} deleted ${subject}`;
    case "EXPENSE_RESTORED":
      return `${actor} restored ${subject}`;
    case "GROUP_CREATED":
      return `${actor} created ${subject}`;
    case "GROUP_UPDATED":
      return `${actor} updated ${subject}`;
    case "GROUP_ARCHIVED":
      return `${actor} archived ${subject}`;
    case "GROUP_RESTORED":
      return `${actor} restored ${subject}`;
    case "GROUP_MEMBER_ADDED":
      return `${actor} added ${member}`;
    case "GROUP_MEMBER_ROLE_UPDATED":
      return `${actor} changed ${member}’s role`;
    case "GROUP_MEMBER_REMOVED":
      return `${actor} removed ${member}`;
    case "GROUP_MEMBER_LEFT":
      return `${member} left the group`;
    case "GROUP_OWNERSHIP_TRANSFERRED":
      return `${actor} transferred ownership to ${member}`;
    case "SETTLEMENT_CREATED":
      return `${text("fromName", actor)} paid ${text("toName", "a member")}`;
    case "SETTLEMENT_REVERSED":
      return `${actor} reversed a payment`;
    case "SETTLEMENT_REPLACED":
      return `${actor} corrected a payment`;
    case "COMMENT_CREATED":
      return `${actor} commented on ${subject}`;
    case "COMMENT_UPDATED":
      return `${actor} edited a comment on ${subject}`;
    case "COMMENT_DELETED":
      return `${actor} deleted a comment on ${subject}`;
    default:
      return `${actor} updated activity`;
  }
}

export function activityTarget(event: ActivityEvent): string | undefined {
  if (event.entityType === "EXPENSE") return `/expenses/${event.entityId}`;
  if (event.entityType === "SETTLEMENT")
    return `/settlements/${event.entityId}`;
  if (
    event.entityType === "COMMENT" &&
    typeof event.payload.expenseId === "string"
  )
    return `/expenses/${event.payload.expenseId}`;
  if (event.groupId) return `/groups/${event.groupId}`;
  return undefined;
}
