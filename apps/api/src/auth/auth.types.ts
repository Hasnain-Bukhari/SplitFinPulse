import type { Request } from "express";

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  principal?: AuthenticatedPrincipal;
}

export interface GoogleIdentityClaims {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string;
  nonce: string;
}

export interface ApplicationTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export interface SessionEnvelope {
  user: {
    id: string;
    email: string | null;
    name: string;
    avatarUrl: string | null;
    defaultCurrency: string;
    timezone: string;
    locale: string;
    notificationPreferences: {
      expenseActivity: boolean;
      reminders: boolean;
      invitations: boolean;
      budgetAlerts: boolean;
    };
    status: string;
  };
  session: {
    id: string;
    current: boolean;
    deviceDescription: string;
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
  };
}
