import { expect, test } from "@playwright/test";

test("presents an accessible Google sign-in entry point", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome to SplitFinPulse" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
});
