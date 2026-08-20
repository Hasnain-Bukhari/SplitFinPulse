import { expect, test } from "@playwright/test";

const friendshipId = "55555555-5555-4555-8555-555555555555";
const settlementId = "66666666-6666-4666-8666-666666666666";
const current = { id: "current-user", name: "Jordan", avatarUrl: null };
const friend = { id: "friend-user", name: "Alex", avatarUrl: null };

function settlementDetail() {
  return {
    id: settlementId,
    groupId: null,
    friendshipId,
    status: "ACTIVE",
    version: 1,
    actor: current,
    from: current,
    to: friend,
    amountMinor: "10000",
    currency: "THB",
    method: "BANK_TRANSFER",
    methodLabel: null,
    settledOn: "2026-08-20",
    note: null,
    reversalReason: null,
    replacesSettlementId: null,
    replacementSettlementId: null,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:00:00.000Z",
    permissions: { canReverse: true, canCorrect: true },
  };
}

test("records a reviewed partial settlement and shows it in activity", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "sfp_csrf",
      value: "settlement-csrf",
      url: "http://127.0.0.1:5173",
    },
  ]);
  let createHeaders: Record<string, string> = {};
  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/auth/session"))
      return json({
        user: { ...current, defaultCurrency: "THB" },
        session: { id: "session-1", current: true },
      });
    if (url.pathname.endsWith("/users/me/preference-options"))
      return json({
        currencies: [{ code: "THB", name: "Thai Baht", minorUnit: 2 }],
        timezones: [],
        locales: [],
      });
    if (url.pathname.endsWith("/balances"))
      return json({
        totals: [],
        contexts: [
          {
            contextType: "FRIENDSHIP",
            contextId: friendshipId,
            name: "Alex",
            amounts: [],
          },
        ],
        nextCursor: null,
      });
    if (url.pathname.endsWith(`/balances/friends/${friendshipId}`))
      return json({
        friendshipId,
        friend,
        amounts: [
          {
            currency: "THB",
            youOweMinor: "15000",
            youAreOwedMinor: "0",
            netMinor: "-15000",
          },
        ],
      });
    if (url.pathname.endsWith("/settlements") && request.method() === "POST") {
      createHeaders = request.headers();
      expect(request.postDataJSON()).toMatchObject({
        fromUserId: current.id,
        toUserId: friend.id,
        amountMinor: "10000",
        currency: "THB",
      });
      return json(settlementDetail(), 201);
    }
    if (url.pathname.endsWith(`/settlements/${settlementId}/revisions`))
      return json({
        items: [
          { ...settlementDetail(), action: "CREATED", revisionNumber: 1 },
        ],
        nextCursor: null,
      });
    if (url.pathname.endsWith(`/settlements/${settlementId}`))
      return json(settlementDetail());
    if (url.pathname.endsWith("/activities"))
      return json({
        items: [
          {
            id: "event-1",
            type: "SETTLEMENT_CREATED",
            actor: current,
            entityType: "SETTLEMENT",
            entityId: settlementId,
            groupId: null,
            friendshipId,
            payloadVersion: 1,
            payload: {
              fromName: "Jordan",
              toName: "Alex",
              amountMinor: "10000",
              currency: "THB",
            },
            occurredAt: "2026-08-20T08:00:00.000Z",
          },
        ],
        nextCursor: null,
      });
    return route.abort();
  });

  await page.goto(`/settlements/new?friendshipId=${friendshipId}`);
  await expect(page.getByLabel("Direction and currency")).toContainText(
    "Jordan pays Alex",
  );
  await page.getByLabel("Amount").fill("100.00");
  await page.getByLabel("Method").selectOption("BANK_TRANSFER");
  await page.getByRole("button", { name: "Review payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm payment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/settlements/${settlementId}$`));
  expect(createHeaders["idempotency-key"]).toBeTruthy();
  expect(createHeaders["x-csrf-token"]).toBe("settlement-csrf");
  await expect(
    page.getByRole("heading", { name: "Jordan paid Alex" }),
  ).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByText("Jordan paid Alex")).toBeVisible();
  await expect(page.getByText("THB 100.00")).toBeVisible();
  await expect(
    page.locator('nav[aria-label="Mobile navigation"] a'),
  ).toHaveCount(5);
});
