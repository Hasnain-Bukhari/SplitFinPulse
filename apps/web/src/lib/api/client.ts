export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  requestId: string;
  timestamp: string;
}

export interface AuthenticatedUser {
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
  };
  status: "ACTIVE" | "DEACTIVATED" | "DELETED";
}

export interface AuthSessionSummary {
  id: string;
  current: boolean;
  deviceDescription: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface SessionEnvelope {
  user: AuthenticatedUser;
  session: AuthSessionSummary;
}

export interface PreferenceOptions {
  currencies: Array<{ code: string; name: string }>;
  timezones: string[];
  locales: Array<{ code: string; name: string }>;
}

export interface UpdateProfileInput {
  name: string;
  avatarVisible: boolean;
  defaultCurrency: string;
  timezone: string;
  locale: string;
  notificationPreferences: AuthenticatedUser["notificationPreferences"];
}

export interface FriendUserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export type FriendshipStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "REMOVED";
export type FriendRequestDirection = "incoming" | "outgoing";

export interface FriendshipSummary {
  friendshipId: string;
  user: FriendUserSummary;
  status: FriendshipStatus;
  direction: FriendRequestDirection;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
}

export interface FriendshipPage {
  items: FriendshipSummary[];
  nextCursor: string | null;
}

export interface FriendDiscoveryResult {
  user: FriendUserSummary;
  relationship: Pick<
    FriendshipSummary,
    "friendshipId" | "status" | "direction"
  > | null;
}

export interface FriendInvitation {
  inviteUrl: string;
  expiresAt: string;
}

export interface FriendInvitationPreview {
  status: "ACTIVE" | "EXPIRED" | "USED" | "REVOKED";
  inviter: { name: string; avatarUrl: string | null };
  expiresAt: string;
}

export type GroupType = "TRIP" | "HOME" | "COUPLE" | "OTHER";
export type GroupStatus = "ACTIVE" | "ARCHIVED";
export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  defaultCurrency: string;
  simplifyDebtsEnabled: boolean;
}

export type UpdateGroupInput = Partial<CreateGroupInput>;

export interface GroupPermissions {
  canEdit: boolean;
  canManageMembers: boolean;
  canCreateInvitations: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
  canLeave: boolean;
  canTransferOwnership: boolean;
  canManageRoles: boolean;
}

export interface GroupMember {
  membershipId: string;
  user: FriendUserSummary;
  role: GroupRole;
  joinedAt: string;
  leftAt: string | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  type: GroupType;
  defaultCurrency: string;
  simplifyDebtsEnabled: boolean;
  status: GroupStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  currentUserRole: GroupRole;
  permissions: GroupPermissions;
  memberCount: number;
}

export interface GroupDetail extends GroupSummary {
  members: GroupMember[];
  membersNextCursor: string | null;
}

export interface GroupPage {
  items: GroupSummary[];
  nextCursor: string | null;
}

export interface GroupMemberPage {
  items: GroupMember[];
  nextCursor: string | null;
}

export interface GroupInvitation {
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface GroupInvitationSummary {
  invitationId: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  inviter: FriendUserSummary;
  expiresAt: string;
  createdAt: string;
}

export interface GroupInvitationPage {
  items: GroupInvitationSummary[];
  nextCursor: string | null;
}

export interface GroupInvitationPreview {
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  group: { name: string; type: GroupType };
  inviter: FriendUserSummary;
  expiresAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

let refreshPromise: Promise<SessionEnvelope> | undefined;

function csrfToken(): string | undefined {
  return document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("sfp_csrf="))
    ?.split("=")[1];
}

async function parseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => undefined)) as
    ApiErrorBody | undefined;
  return new ApiError(
    body?.message ?? "The service could not complete the request",
    response.status,
    body?.code ?? "REQUEST_FAILED",
    body?.requestId,
  );
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retryAuthentication = true,
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(unsafe && csrfToken() ? { "X-CSRF-Token": csrfToken()! } : {}),
      ...init.headers,
    },
  });

  if (
    response.status === 401 &&
    retryAuthentication &&
    path !== "/api/v1/auth/refresh"
  ) {
    refreshPromise ??= request<SessionEnvelope>(
      "/api/v1/auth/refresh",
      { method: "POST" },
      false,
    ).finally(() => {
      refreshPromise = undefined;
    });
    try {
      await refreshPromise;
      return request<T>(path, init, false);
    } catch {
      throw await parseError(response);
    }
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function download(path: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(csrfToken() ? { "X-CSRF-Token": csrfToken()! } : {}),
    },
  });
  if (!response.ok) throw await parseError(response);
  return response.blob();
}

export const api = {
  health: (): Promise<HealthResponse> => request<HealthResponse>("/health"),
  session: (): Promise<SessionEnvelope> => request("/api/v1/auth/session"),
  logout: (): Promise<void> =>
    request("/api/v1/auth/logout", { method: "POST" }),
  sessions: (): Promise<AuthSessionSummary[]> =>
    request("/api/v1/auth/sessions"),
  revokeSession: (id: string): Promise<void> =>
    request(`/api/v1/auth/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  revokeAllSessions: (): Promise<void> =>
    request("/api/v1/auth/sessions/revoke-all", { method: "POST" }),
  profileOptions: (): Promise<PreferenceOptions> =>
    request("/api/v1/users/me/preference-options"),
  updateProfile: (input: UpdateProfileInput): Promise<AuthenticatedUser> =>
    request("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  reauthenticate: (): Promise<{ authorizationUrl: string }> =>
    request("/api/v1/auth/reauthenticate?returnTo=/settings/data", {
      method: "POST",
    }),
  reactivate: (): Promise<{ authorizationUrl: string }> =>
    request("/api/v1/auth/reactivate", { method: "POST" }),
  exportAccount: (): Promise<Blob> => download("/api/v1/users/me/export"),
  deactivate: (): Promise<void> =>
    request("/api/v1/users/me/deactivate", { method: "POST" }),
  deleteAccount: (): Promise<void> =>
    request("/api/v1/users/me", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE" }),
    }),
  friends: (cursor?: string): Promise<FriendshipPage> =>
    request(
      `/api/v1/friends${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  friendRequests: (
    direction: FriendRequestDirection,
    cursor?: string,
  ): Promise<FriendshipPage> => {
    const query = new URLSearchParams({ direction });
    if (cursor) query.set("cursor", cursor);
    return request(`/api/v1/friends/requests?${query}`);
  },
  discoverFriend: (email: string): Promise<FriendDiscoveryResult> =>
    request(`/api/v1/friends/discovery?email=${encodeURIComponent(email)}`),
  discoverContacts: (emails: string[]): Promise<FriendDiscoveryResult[]> =>
    request("/api/v1/friends/discovery/contacts", {
      method: "POST",
      body: JSON.stringify({ emails }),
    }),
  createFriendRequest: (userId: string): Promise<FriendshipSummary> =>
    request("/api/v1/friends/requests", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  acceptFriendRequest: (friendshipId: string): Promise<FriendshipSummary> =>
    request(
      `/api/v1/friends/requests/${encodeURIComponent(friendshipId)}/accept`,
      { method: "POST" },
    ),
  declineFriendRequest: (friendshipId: string): Promise<FriendshipSummary> =>
    request(
      `/api/v1/friends/requests/${encodeURIComponent(friendshipId)}/decline`,
      { method: "POST" },
    ),
  removeFriend: (friendshipId: string): Promise<void> =>
    request(`/api/v1/friends/${encodeURIComponent(friendshipId)}`, {
      method: "DELETE",
    }),
  createFriendInvitation: (): Promise<FriendInvitation> =>
    request("/api/v1/friend-invitations", { method: "POST" }),
  friendInvitation: (token: string): Promise<FriendInvitationPreview> =>
    request(`/api/v1/friend-invitations/${encodeURIComponent(token)}`),
  acceptFriendInvitation: (token: string): Promise<FriendshipSummary> =>
    request(`/api/v1/friend-invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),
  groups: (status: GroupStatus, cursor?: string): Promise<GroupPage> => {
    const query = new URLSearchParams({ status });
    if (cursor) query.set("cursor", cursor);
    return request(`/api/v1/groups?${query}`);
  },
  createGroup: (input: CreateGroupInput): Promise<GroupDetail> =>
    request("/api/v1/groups", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  group: (id: string): Promise<GroupDetail> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}`),
  updateGroup: (id: string, input: UpdateGroupInput): Promise<GroupDetail> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  archiveGroup: (id: string): Promise<GroupDetail> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}/archive`, {
      method: "POST",
    }),
  restoreGroup: (id: string): Promise<GroupDetail> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}/restore`, {
      method: "POST",
    }),
  deleteGroup: (id: string): Promise<void> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}`, { method: "DELETE" }),
  groupMembers: (id: string, cursor?: string): Promise<GroupMemberPage> =>
    request(
      `/api/v1/groups/${encodeURIComponent(id)}/members${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  addGroupMember: (id: string, userId: string): Promise<GroupMember> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  updateGroupMemberRole: (
    id: string,
    membershipId: string,
    role: Exclude<GroupRole, "OWNER">,
  ): Promise<GroupMember> =>
    request(
      `/api/v1/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(membershipId)}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),
  removeGroupMember: (id: string, membershipId: string): Promise<void> =>
    request(
      `/api/v1/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(membershipId)}`,
      { method: "DELETE" },
    ),
  leaveGroup: (id: string): Promise<void> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}/leave`, {
      method: "POST",
    }),
  transferGroupOwnership: (
    id: string,
    membershipId: string,
  ): Promise<GroupDetail> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}/transfer-ownership`, {
      method: "POST",
      body: JSON.stringify({ membershipId }),
    }),
  createGroupInvitation: (id: string): Promise<GroupInvitation> =>
    request(`/api/v1/groups/${encodeURIComponent(id)}/invitations`, {
      method: "POST",
    }),
  groupInvitations: (
    id: string,
    cursor?: string,
  ): Promise<GroupInvitationPage> =>
    request(
      `/api/v1/groups/${encodeURIComponent(id)}/invitations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  revokeGroupInvitation: (id: string, invitationId: string): Promise<void> =>
    request(
      `/api/v1/groups/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" },
    ),
  groupInvitation: (token: string): Promise<GroupInvitationPreview> =>
    request(`/api/v1/group-invitations/${encodeURIComponent(token)}`),
  acceptGroupInvitation: (token: string): Promise<GroupDetail> =>
    request(`/api/v1/group-invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),
  googleLoginUrl: (returnTo = "/"): string =>
    `${apiBaseUrl}/api/v1/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`,
};
