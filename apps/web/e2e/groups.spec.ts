import { expect, test } from "@playwright/test";

const owner = {
  membershipId: "11111111-1111-4111-8111-111111111111",
  user: { id: "owner-user", name: "Jordan Owner", avatarUrl: null },
  role: "OWNER",
  joinedAt: "2026-08-17T00:00:00.000Z",
  leftAt: null,
};
const member = {
  membershipId: "22222222-2222-4222-8222-222222222222",
  user: { id: "member-user", name: "Alex Member", avatarUrl: null },
  role: "MEMBER",
  joinedAt: "2026-08-17T00:01:00.000Z",
  leftAt: null,
};

function groupDetail(status: "ACTIVE" | "ARCHIVED" = "ACTIVE") {
  const active = status === "ACTIVE";
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Bangkok Weekend",
    type: "TRIP",
    defaultCurrency: "THB",
    simplifyDebtsEnabled: true,
    status,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    archivedAt: active ? null : "2026-08-17T01:00:00.000Z",
    currentUserRole: "OWNER",
    memberCount: 2,
    permissions: {
      canEdit: active,
      canManageMembers: active,
      canCreateInvitations: active,
      canArchive: active,
      canRestore: !active,
      canDelete: false,
      canLeave: false,
      canTransferOwnership: active,
      canManageRoles: active,
    },
    members: [owner, member],
    membersNextCursor: null,
  };
}

test("creates and manages a group with accessible deferred finance states", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "sfp_csrf", value: "browser-csrf", url: "http://127.0.0.1:5173" },
  ]);
  let group = groupDetail();
  let roleUpdate = "";

  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.pathname.endsWith("/auth/session")) {
      return json({
        user: {
          id: "owner-user",
          name: "Jordan Owner",
          avatarUrl: null,
          defaultCurrency: "THB",
        },
        session: { id: "session-1", current: true },
      });
    }
    if (url.pathname.endsWith("/users/me/preference-options")) {
      return json({
        currencies: [{ code: "THB", name: "Thai Baht" }],
        timezones: [],
        locales: [],
      });
    }
    if (url.pathname.endsWith("/groups") && request.method() === "POST") {
      group = groupDetail();
      return json(group, 201);
    }
    if (url.pathname.endsWith("/groups") && request.method() === "GET") {
      return json({ items: [group], nextCursor: null });
    }
    if (url.pathname.endsWith("/members") && request.method() === "GET") {
      return json({ items: [owner, member], nextCursor: null });
    }
    if (url.pathname.includes(`/members/${member.membershipId}`)) {
      roleUpdate = request.postDataJSON().role as string;
      member.role = roleUpdate;
      return json(member);
    }
    if (url.pathname.endsWith("/invitations") && request.method() === "GET") {
      return json({ items: [], nextCursor: null });
    }
    if (url.pathname.endsWith("/invitations") && request.method() === "POST") {
      return json(
        {
          invitationId: "invite-1",
          inviteUrl: "http://127.0.0.1:5173/group-invite/browser-token",
          expiresAt: "2026-08-24T00:00:00.000Z",
        },
        201,
      );
    }
    if (url.pathname.endsWith("/archive")) {
      group = groupDetail("ARCHIVED");
      return json(group);
    }
    if (url.pathname.endsWith(`/groups/${group.id}`)) return json(group);
    if (url.pathname.includes("/friends")) {
      return json({ items: [], nextCursor: null });
    }
    return route.abort();
  });

  await page.goto("/groups/new");
  await page.getByLabel("Group name").fill("Bangkok Weekend");
  await page.getByLabel("Group type").selectOption("TRIP");
  await page.getByRole("button", { name: "Create group" }).click();

  await expect(page).toHaveURL(/\/groups\/33333333/);
  await expect(
    page.getByRole("heading", { name: "Bangkok Weekend" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();
  await expect(page.getByText("auditable ledger")).toBeVisible();

  await page.getByRole("link", { name: "Manage" }).click();
  await page
    .getByLabel("Role for Alex Member")
    .selectOption({ label: "Admin" });
  await expect.poll(() => roleUpdate).toBe("ADMIN");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByLabel("Group invitation link")).toHaveValue(
    /group-invite\/browser-token/,
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive group" }).click();
  await expect(
    page.getByRole("button", { name: "Restore group" }),
  ).toBeVisible();
});

test("previews and accepts a shareable group invitation", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "sfp_csrf", value: "browser-csrf", url: "http://127.0.0.1:5173" },
  ]);
  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.endsWith("/auth/session")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "member-user", name: "Alex Member", avatarUrl: null },
          session: { id: "session-2", current: true },
        }),
      });
    }
    if (url.includes("/group-invitations/") && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ACTIVE",
          group: { name: "Bangkok Weekend", type: "TRIP" },
          inviter: { id: "owner-user", name: "Jordan Owner", avatarUrl: null },
          expiresAt: "2026-08-24T00:00:00.000Z",
        }),
      });
    }
    if (url.includes("/group-invitations/") && request.method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...groupDetail(),
          currentUserRole: "MEMBER",
        }),
      });
    }
    if (url.includes("/groups/") && url.endsWith("/members")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [owner, member], nextCursor: null }),
      });
    }
    if (url.includes("/groups/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...groupDetail(),
          currentUserRole: "MEMBER",
        }),
      });
    }
    return route.abort();
  });

  await page.goto("/group-invite/browser-token");
  await expect(
    page.getByRole("heading", { name: "Join Bangkok Weekend" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/groups\/33333333/);
  await expect(
    page.getByRole("heading", { name: "Bangkok Weekend" }),
  ).toBeVisible();
});
