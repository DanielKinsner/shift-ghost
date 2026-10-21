import { expect, test } from "@playwright/test";
import { freshState, morningState, primeState } from "./state";

test("the landing page is share-ready and stays inside narrow viewports", async ({ page, request }) => {
  await primeState(page, freshState());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page).toHaveTitle("Shift Ghost — Voice-to-Shift Handoff Demo");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Shift Ghost — Voice-to-Shift Handoff");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const card = await request.get("/api/og");
  expect(card.ok()).toBe(true);
  expect(card.headers()["content-type"]).toContain("image/png");
  expect((await card.body()).byteLength).toBeGreaterThan(10_000);
});

test("two managers editing the same task get a conflict, not a silent overwrite", async ({ page }) => {
  const db = morningState();
  db.demo.simulateConflictNext = true;
  await primeState(page, db);
  await page.goto("/briefing");
  const refund = page.getByRole("article", { name: "Table 12 refund still not received" });
  await refund.getByRole("button", { name: "Claim" }).click();
  const dialog = page.getByRole("dialog", { name: "Someone else just changed this task" });
  await expect(dialog).toContainText("Bri Ellis claimed it");
  await dialog.getByRole("button", { name: /Keep Bri.s change/ }).click();
  await expect(refund.getByText(/Claimed · Bri/)).toBeVisible();
});

test("claims are optimistic and can be undone", async ({ page }) => {
  await primeState(page, morningState());
  await page.goto("/briefing");
  const ice = page.getByRole("article", { name: "Ice machine grinding again" });
  await ice.getByRole("button", { name: "Claim" }).click();
  await expect(ice.getByText(/Claimed · Luis/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(ice.getByRole("button", { name: "Claim" })).toBeVisible();
  await page.goto("/audit");
  await expect(page.getByText(/Undid: Claim/).first()).toBeVisible();
});

test("asking the previous shift closes the loop with a reply", async ({ page }) => {
  await primeState(page, morningState());
  await page.goto("/briefing");
  const ice = page.getByRole("article", { name: "Ice machine grinding again" });
  await ice.getByRole("button", { name: "Ask Maya" }).click();
  await page.getByLabel("Your question").fill("Is it still making the noise?");
  await page.getByRole("button", { name: "Send to Maya" }).click();
  await expect(ice.getByText(/front panel off/)).toBeVisible({ timeout: 10_000 });
});

test("critical escalation from the brief asks for confirmation first", async ({ page }) => {
  await primeState(page, morningState());
  await page.goto("/briefing");
  const ice = page.getByRole("article", { name: "Ice machine grinding again" });
  await ice.getByRole("button", { name: "Escalate" }).click();
  const dialog = page.getByRole("dialog", { name: "Escalate a critical issue?" });
  await expect(dialog).toContainText("Jordan Cole");
  await dialog.getByRole("button", { name: /Yes, escalate to Jordan/ }).click();
  await expect(ice.getByText("Escalated to Jordan", { exact: true })).toBeVisible();
});
