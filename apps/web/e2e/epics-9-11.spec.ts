import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Jordan Owner",
  avatarUrl: null,
  defaultCurrency: "USD",
  locale: "en-US",
};

async function mockBase(page: Page): Promise<void> {
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
      return json({ user, session: { id: "session", current: true } });
    if (url.pathname.endsWith("/users/me/preference-options"))
      return json({
        currencies: [
          { code: "USD", name: "US Dollar", minorUnit: 2 },
          { code: "JPY", name: "Japanese Yen", minorUnit: 0 },
          { code: "KWD", name: "Kuwaiti Dinar", minorUnit: 3 },
        ],
        timezones: [],
        locales: [],
      });
    if (url.pathname.endsWith("/categories"))
      return json({
        items: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            kind: "SYSTEM",
            key: "food",
            name: "Food & dining",
            icon: "utensils",
            archived: false,
            canManage: false,
          },
        ],
      });
    if (url.pathname.endsWith("/groups"))
      return json({ items: [], nextCursor: null });
    if (url.pathname.endsWith("/friends"))
      return json({ items: [], nextCursor: null });
    if (url.pathname.endsWith("/search"))
      return json({ expenses: [], groups: [], people: [] });
    if (url.pathname.endsWith("/expenses") && request.method() === "GET")
      return json({
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            description: "Dinner",
            totalMinor: "1234",
            currency: "USD",
            expenseDate: "2026-08-20",
            status: "ACTIVE",
            groupId: null,
            friendshipId: null,
            version: 1,
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
            category: { id: null, name: "Food & dining", icon: "utensils" },
            settlement: {
              state: "OPEN",
              allocatedMinor: "0",
              remainingMinor: "1234",
            },
          },
        ],
        nextCursor: null,
      });
    if (url.pathname.endsWith("/attachment-upload-intents"))
      return json(
        {
          attachmentId: "44444444-4444-4444-8444-444444444444",
          uploadUrl:
            "/api/v1/attachment-uploads/44444444-4444-4444-8444-444444444444",
          uploadToken: "one-use-token",
          expiresAt: "2026-08-20T00:15:00.000Z",
        },
        201,
      );
    if (url.pathname.includes("/attachment-uploads/"))
      return json({
        id: "44444444-4444-4444-8444-444444444444",
        expenseId: null,
        originalName: "receipt.png",
        mime: "image/png",
        sizeBytes: 68,
        status: "AVAILABLE",
        scanStatus: "NOT_CONFIGURED",
        createdAt: "2026-08-20T00:00:00.000Z",
      });
    if (url.pathname.endsWith("/extraction"))
      return json({
        status: "SUCCEEDED",
        merchant: "Corner Market",
        expenseDate: "2026-08-19",
        totalText: "12.34",
        currencyHint: "USD",
        confidence: "91.0",
        errorCode: null,
      });
    return route.abort();
  });
}

test("keeps combined expense filters in the URL across reload and clears them", async ({
  page,
}) => {
  await mockBase(page);
  await page.goto(
    "/expenses?q=Dinner&currency=USD&settledState=OPEN&sort=DATE_DESC",
  );
  await expect(
    page.locator("#main-content").getByRole("heading", { name: "Expenses" }),
  ).toBeVisible();
  await expect(page.getByLabel("Search")).toHaveValue("Dinner");
  await expect(page.getByRole("combobox", { name: /^Currency/ })).toHaveValue(
    "USD",
  );
  await expect(page.getByRole("combobox", { name: /^Settlement/ })).toHaveValue(
    "OPEN",
  );
  await page.reload();
  await expect(page.getByLabel("Search")).toHaveValue("Dinner");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
});

test("uploads a private receipt and applies OCR suggestions only on demand", async ({
  page,
}) => {
  await mockBase(page);
  await page.goto("/expenses/new");
  await page.getByLabel("Choose receipt image or PDF").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const suggestion = page.getByRole("button", {
    name: "Use merchant: Corner Market",
  });
  await expect(suggestion).toBeVisible();
  await expect(page.getByLabel("Description")).toHaveValue("");
  await suggestion.click();
  await expect(page.getByLabel("Description")).toHaveValue("Corner Market");
});
