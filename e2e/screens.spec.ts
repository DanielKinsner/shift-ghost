import { expect, test, type Page } from "@playwright/test";
import { freshState, handoffIdOf, morningState, primeState } from "./state";
import type { DemoDB } from "../src/domain/types";

/**
 * Visual QA sweep. Run with SCREENS=1 (it writes docs/screenshots/*.png):
 *   SCREENS=1 npx playwright test e2e/screens.spec.ts
 */
test.skip(!process.env.SCREENS, "Set SCREENS=1 to capture screenshots");

const WIDTHS = { phone: 390, tablet: 768, desktop: 1440, wide: 2560 } as const;
type W = keyof typeof WIDTHS;

async function shoot(page: Page, name: string, width: W, opts: { full?: boolean } = {}) {
  await page.setViewportSize({ width: WIDTHS[width], height: width === "phone" ? 844 : width === "tablet" ? 1024 : width === "wide" ? 1300 : 900 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `docs/screenshots/${name}-${width}.png`, fullPage: opts.full ?? true });
}

async function open(page: Page, db: DemoDB, path: string, ready: RegExp | string) {
  await primeState(page, db);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: ready }).first()).toBeVisible();
}

test("landing", async ({ page }) => {
  await open(page, freshState(), "/", /Two minutes of talk/);
  for (const w of ["phone", "tablet", "desktop", "wide"] as W[]) await shoot(page, "landing", w);
});

test("setup", async ({ page }) => {
  const db = freshState();
  db.demo.currentUserId = "u-jordan";
  await open(page, db, "/setup", "Company and stores");
  await shoot(page, "setup-1", "desktop");
  await shoot(page, "setup-1", "phone");
  for (const next of ["Continue to shifts", "Continue to questions"]) await page.getByRole("button", { name: next }).click();
  await expect(page.getByRole("heading", { name: "The five closeout questions" })).toBeVisible();
  await shoot(page, "setup-3", "desktop");
  await page.getByRole("button", { name: "Continue to escalation" }).click();
  await page.getByRole("button", { name: "Continue to recipients" }).click();
  await expect(page.getByRole("heading", { name: "Recipients and first brief" })).toBeVisible();
  await shoot(page, "setup-5", "desktop");
});

test("capture", async ({ page }) => {
  await open(page, freshState(), "/capture", "Five questions. About two minutes.");
  await shoot(page, "capture-intro", "phone");
  await page.getByRole("button", { name: "Start closeout" }).click();
  await expect(page.getByRole("heading", { name: "What broke, failed, or behaved unusually?" })).toBeVisible();
  await shoot(page, "capture-question", "phone");
  await shoot(page, "capture-question", "desktop");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /Demo shortcut/ }).click();
  await shoot(page, "capture-review", "phone");
});

test("review", async ({ page }) => {
  const db = morningState();
  db.demo.clockAnchor = "2026-10-20T22:46:00Z";
  db.demo.currentUserId = "u-maya";
  await open(page, db, `/handoffs/${handoffIdOf(db)}`, "Downtown closeout");
  for (const w of ["phone", "desktop", "wide"] as W[]) await shoot(page, "review", w);
});

test("briefing", async ({ page }) => {
  await open(page, morningState({ claimIce: true }), "/briefing", "Opening brief");
  for (const w of ["phone", "tablet", "desktop", "wide"] as W[]) await shoot(page, "briefing", w);
});

test("briefing awaiting", async ({ page }) => {
  const db = freshState();
  db.demo.currentUserId = "u-luis";
  await open(page, db, "/briefing", "Opening brief");
  await shoot(page, "briefing-awaiting", "phone");
});

test("patterns", async ({ page }) => {
  await open(page, morningState({ user: "u-jordan" }), "/patterns", "What keeps coming back");
  for (const w of ["phone", "tablet", "desktop", "wide"] as W[]) await shoot(page, "patterns", w);
});

test("issue", async ({ page }) => {
  const db = morningState();
  const ice = Object.values(db.issues).find((i) => i.subjectKey === "asset:ice-machine")!;
  await open(page, db, `/issues/${ice.id}`, "Ice machine grinding again");
  await shoot(page, "issue", "desktop");
  await shoot(page, "issue", "phone");
});

test("rules", async ({ page }) => {
  await open(page, morningState({ user: "u-jordan" }), "/rules", "Rules and escalation");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await shoot(page, "rules", "desktop");
  await shoot(page, "rules", "phone");
});

test("ops pages", async ({ page }) => {
  const db = morningState({ user: "u-jordan" });
  await open(page, db, "/locations", "Stores and shifts");
  await shoot(page, "locations", "desktop");
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Team and notifications" })).toBeVisible();
  await shoot(page, "team", "desktop");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await shoot(page, "settings", "desktop");
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit trail" })).toBeVisible();
  await shoot(page, "audit", "desktop", { full: false });
  await shoot(page, "audit", "phone", { full: false });
  await page.goto("/handoffs");
  await expect(page.getByRole("heading", { name: "Handoffs" })).toBeVisible();
  await shoot(page, "handoffs", "desktop", { full: false });
  await page.goto("/explainer");
  await expect(page.getByRole("heading", { name: "The 45-second version" })).toBeVisible();
  await page.waitForTimeout(1500);
  await shoot(page, "explainer", "desktop");
});

test("states", async ({ page }) => {
  const db = morningState({ user: "u-bri" });
  await open(page, db, "/rules", /Only your area manager can open/);
  await shoot(page, "permission-denied", "phone");
  const off = morningState();
  off.demo.network = "offline";
  off.demo.outbox = [{ id: "ob-1", at: off.demo.clockAnchor, label: "Claim", kind: "action", refId: null }];
  await page.context().clearCookies();
  const p2 = await page.context().newPage();
  await primeState(p2, off);
  await p2.goto("/briefing");
  await expect(p2.getByRole("heading", { name: "Opening brief" })).toBeVisible();
  await shoot(p2, "offline", "phone", { full: false });
});
