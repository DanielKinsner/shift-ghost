import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { freshState, handoffIdOf, morningState, primeState } from "./state";

/** WCAG 2.1 AA scan of the screens in the demo story. */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length) {
    console.log(
      `\n[${label}]\n` +
        serious.map((v) => `  ${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 4).map((n) => `    ${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n")}`).join("\n"),
    );
  }
  expect(serious, `${label}: ${serious.map((v) => v.id).join(", ")}`).toEqual([]);
}

test("landing", async ({ page }) => {
  await primeState(page, freshState());
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await scan(page, "landing");
});

test("capture", async ({ page }) => {
  await primeState(page, freshState());
  await page.goto("/capture");
  await page.getByRole("button", { name: "Start closeout" }).click();
  await expect(page.getByRole("heading", { name: "What broke, failed, or behaved unusually?" })).toBeVisible();
  await page.waitForTimeout(800); // let the question slide in before measuring contrast
  await scan(page, "capture");
});

test("review", async ({ page }) => {
  const db = morningState();
  db.demo.currentUserId = "u-maya";
  await primeState(page, db);
  await page.goto(`/handoffs/${handoffIdOf(db)}`);
  await expect(page.getByRole("heading", { name: "What Shift Ghost heard" })).toBeVisible();
  await scan(page, "review");
});

test("briefing", async ({ page }) => {
  await primeState(page, morningState({ claimIce: true }));
  await page.goto("/briefing");
  await expect(page.getByRole("heading", { name: /What can hurt today/ })).toBeVisible();
  await scan(page, "briefing");
});

test("patterns", async ({ page }) => {
  await primeState(page, morningState({ user: "u-jordan" }));
  await page.goto("/patterns");
  await expect(page.getByRole("heading", { name: "What keeps coming back" })).toBeVisible();
  await scan(page, "patterns");
});

test("rules", async ({ page }) => {
  const db = morningState({ user: "u-jordan" });
  await primeState(page, db);
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules and escalation" })).toBeVisible();
  await scan(page, "rules");
});

test("setup", async ({ page }) => {
  const db = freshState();
  db.demo.currentUserId = "u-jordan";
  await primeState(page, db);
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Company and stores" })).toBeVisible();
  await page.waitForTimeout(500);
  await scan(page, "setup");
});
