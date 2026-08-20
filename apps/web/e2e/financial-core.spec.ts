import { expect, test } from "@playwright/test";

const groupId = "33333333-3333-4333-8333-333333333333";
const expenseId = "44444444-4444-4444-8444-444444444444";
const owner = { id: "owner-user", name: "Jordan Owner", avatarUrl: null };
const member = { id: "member-user", name: "Alex Member", avatarUrl: null };

function expenseDetail(status: "ACTIVE" | "DELETED", version: number) {
  return {
    id: expenseId,
    description: "Riverside dinner",
    totalMinor: "30000",
    currency: "THB",
    expenseDate: "2026-08-17",
    notes: null,
    status,
    groupId,
    friendshipId: null,
    version,
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    creator: owner,
    splitMethod: "EQUAL",
    payers: [{ userId: owner.id, user: owner, amountMinor: "30000" }],
    splits: [
      { userId: owner.id, user: owner, owedMinor: "15000" },
      { userId: member.id, user: member, owedMinor: "15000" },
    ],
    ledgerEntries: [
      {
        debtorId: member.id,
        debtor: member,
        creditorId: owner.id,
        creditor: owner,
        amountMinor: "15000",
        currency: "THB",
        sequence: 0,
      },
    ],
    permissions: {
      canEdit: status === "ACTIVE",
      canDelete: status === "ACTIVE",
      canRestore: status === "DELETED",
    },
    category: null,
    valuation: null,
    settlement: {
      state: "OPEN",
      allocatedMinor: "0",
      remainingMinor: "15000",
      obligations: [
        {
          sequence: 0,
          debtorId: member.id,
          creditorId: owner.id,
          originalMinor: "15000",
          allocatedMinor: "0",
          remainingMinor: "15000",
          currency: "THB",
        },
      ],
      resolvingSettlements: [],
    },
  };
}

test("creates, previews, deletes, and restores an equal group expense", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "sfp_csrf", value: "browser-csrf", url: "http://127.0.0.1:5173" },
  ]);
  let status: "ACTIVE" | "DELETED" = "ACTIVE";
  let version = 1;
  let createHeaders: Record<string, string> = {};

  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, responseStatus = 200) =>
      route.fulfill({
        status: responseStatus,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.pathname.endsWith("/auth/session")) {
      return json({
        user: { ...owner, defaultCurrency: "THB" },
        session: { id: "session-1", current: true },
      });
    }
    if (url.pathname.endsWith("/users/me/preference-options")) {
      return json({
        currencies: [{ code: "THB", name: "Thai Baht", minorUnit: 2 }],
        timezones: [],
        locales: [],
      });
    }
    if (url.pathname.endsWith("/groups") && request.method() === "GET") {
      return json({
        items: [
          {
            id: groupId,
            name: "Bangkok Weekend",
            type: "TRIP",
            defaultCurrency: "THB",
            simplifyDebtsEnabled: true,
            status: "ACTIVE",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
            archivedAt: null,
            currentUserRole: "OWNER",
            permissions: {},
            memberCount: 2,
          },
        ],
        nextCursor: null,
      });
    }
    if (url.pathname.endsWith("/friends") && request.method() === "GET") {
      return json({ items: [], nextCursor: null });
    }
    if (url.pathname.endsWith(`/groups/${groupId}/members`)) {
      return json({
        items: [
          {
            membershipId: "membership-owner",
            user: owner,
            role: "OWNER",
            joinedAt: "2026-08-17T00:00:00.000Z",
            leftAt: null,
          },
          {
            membershipId: "membership-member",
            user: member,
            role: "MEMBER",
            joinedAt: "2026-08-17T00:01:00.000Z",
            leftAt: null,
          },
        ],
        nextCursor: null,
      });
    }
    if (url.pathname.endsWith("/expenses/preview")) {
      expect(request.postDataJSON()).toMatchObject({
        groupId,
        totalMinor: "30000",
        splitMethod: "EQUAL",
        participants: [{ userId: owner.id }, { userId: member.id }],
      });
      return json({
        totalMinor: "30000",
        currency: "THB",
        payers: [{ userId: owner.id, user: owner, amountMinor: "30000" }],
        splits: [
          { userId: owner.id, user: owner, owedMinor: "15000" },
          { userId: member.id, user: member, owedMinor: "15000" },
        ],
        ledgerEntries: expenseDetail("ACTIVE", 1).ledgerEntries,
      });
    }
    if (url.pathname.endsWith("/expenses") && request.method() === "POST") {
      createHeaders = request.headers();
      return json(expenseDetail("ACTIVE", 1), 201);
    }
    if (url.pathname.endsWith(`/expenses/${expenseId}/revisions`)) {
      const detail = expenseDetail(status, version);
      return json({
        items: [
          {
            id: `revision-${version}`,
            revisionNumber: version,
            action:
              status === "DELETED"
                ? "DELETED"
                : version > 2
                  ? "RESTORED"
                  : "CREATED",
            actor: owner,
            createdAt: "2026-08-17T12:00:00.000Z",
            description: detail.description,
            totalMinor: detail.totalMinor,
            currency: detail.currency,
            expenseDate: detail.expenseDate,
            notes: null,
            splitMethod: detail.splitMethod,
            payers: detail.payers,
            splits: detail.splits,
            ledgerEntries: detail.ledgerEntries,
          },
        ],
        nextCursor: null,
      });
    }
    if (
      url.pathname.endsWith(`/expenses/${expenseId}/restore`) &&
      request.method() === "POST"
    ) {
      status = "ACTIVE";
      version += 1;
      return json(expenseDetail(status, version));
    }
    if (url.pathname.endsWith(`/expenses/${expenseId}`)) {
      if (request.method() === "DELETE") {
        status = "DELETED";
        version += 1;
      }
      return json(expenseDetail(status, version));
    }
    return route.abort();
  });

  await page.goto("/expenses/new");
  await page.getByLabel("Friend or group").selectOption(`group:${groupId}`);
  await expect(page.getByText("Alex Member").first()).toBeVisible();
  await page.getByLabel("Description").fill("Riverside dinner");
  await page
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("300.00");
  await page.getByRole("button", { name: "Preview expense" }).click();
  await expect(page.getByText("Alex Member owes Jordan Owner")).toBeVisible();
  await page.getByRole("button", { name: "Create expense" }).click();

  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}$`));
  expect(createHeaders["idempotency-key"]).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Riverside dinner" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your effect: owed to you THB 150.00"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Who owes whom" }).locator(".."),
  ).toContainText(/Alex Member\s*owes\s*Jordan Owner\s*THB 150\.00/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
});
