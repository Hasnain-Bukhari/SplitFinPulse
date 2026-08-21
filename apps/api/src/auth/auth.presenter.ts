import type { AuthSession, User } from "../generated/prisma/client";
import type { SessionEnvelope } from "./auth.types";

export function presentUser(user: User): SessionEnvelope["user"] {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    defaultCurrency: user.defaultCurrency,
    timezone: user.timezone,
    locale: user.locale,
    notificationPreferences: {
      expenseActivity: user.notifyExpenseActivity,
      reminders: user.notifyReminders,
      invitations: user.notifyInvitations,
      budgetAlerts: user.notifyBudgetAlerts,
    },
    status: user.status,
  };
}

export function presentSession(
  session: AuthSession,
  currentSessionId: string,
): SessionEnvelope["session"] {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    deviceDescription: session.deviceDescription,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt:
      session.idleExpiresAt < session.absoluteExpiresAt
        ? session.idleExpiresAt
        : session.absoluteExpiresAt,
  };
}
