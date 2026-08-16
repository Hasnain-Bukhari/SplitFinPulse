import { expect, test } from "@playwright/test";

test("shows a safe invitation landing state on desktop and mobile", async ({
  page,
}) => {
  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/friend-invitations/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ACTIVE",
          inviter: { name: "Alex", avatarUrl: null },
          expiresAt: "2026-08-21T00:00:00.000Z",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "AUTH_REQUIRED", message: "Sign in" }),
    });
  });

  await page.goto("/invite/test-token");
  await expect(
    page.getByRole("heading", { name: "Alex invited you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to accept" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
});

test("accepts an invitation and refreshes the friends destination", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "sfp_csrf", value: "browser-csrf", url: "http://127.0.0.1:5173" },
  ]);
  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/auth/session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "user-2", name: "Jordan", avatarUrl: null },
          session: { id: "session-1", current: true },
        }),
      });
      return;
    }
    if (
      url.includes("/friend-invitations/") &&
      route.request().method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ACTIVE",
          inviter: { name: "Alex", avatarUrl: null },
          expiresAt: "2026-08-21T00:00:00.000Z",
        }),
      });
      return;
    }
    if (
      url.includes("/friend-invitations/") &&
      route.request().method() === "POST"
    ) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ friendshipId: "friend-1", status: "ACCEPTED" }),
      });
      return;
    }
    if (url.includes("/friends")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], nextCursor: null }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/invite/test-token");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Friends", exact: true }),
  ).toBeVisible();
});
