import { expect, test } from "@playwright/test";

/**
 * The acceptance story, end to end in a fresh browser:
 * configure, closeout, confirm, morning, claim, resolve, pattern, explainer.
 */
test("setup to closeout to morning claim to resolution", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start the four-minute demo" }).click();

  // 1. Configure Nightjar Kitchens (as the area manager)
  await expect(page.getByRole("heading", { name: "Company and stores" })).toBeVisible();
  await page.getByLabel("Company name").fill("Nightjar Kitchens");
  for (const next of ["Continue to shifts", "Continue to questions", "Continue to escalation", "Continue to recipients"]) {
    await page.getByRole("button", { name: next }).click();
  }
  await expect(page.getByRole("heading", { name: "Recipients and first brief" })).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();

  // 2. Submit tonight's closeout as Maya
  await expect(page).toHaveURL(/\/capture$/);
  await page.getByRole("button", { name: /Demo shortcut/ }).click();
  await expect(page.getByRole("heading", { name: "Read it back once" })).toBeVisible();
  await page.getByRole("button", { name: "Submit closeout" }).click();

  // 3. Confirm what Shift Ghost wasn't sure about, then publish (critical asks first)
  await expect(page.getByRole("heading", { name: "What Shift Ghost heard" })).toBeVisible();
  await expect(page.getByText("2 items need you.")).toBeVisible();
  const publish = page.getByRole("button", { name: "Publish to the opening crew" });
  await expect(publish).toBeDisabled();
  await page.getByRole("article", { name: /Large cups out, lent to Northgate/ }).getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("article", { name: /Back door sensor flashed twice/ }).getByRole("button", { name: "Confirm" }).click();
  await publish.click();
  await expect(page.getByRole("dialog", { name: "This will page someone tonight" })).toContainText("Jordan Cole");
  await page.getByRole("button", { name: "Publish and notify" }).click();

  // 4. Switch to Luis the next morning
  await page.getByRole("button", { name: "Be Luis at 6:15 AM" }).click();
  await expect(page).toHaveURL(/\/briefing$/);
  await expect(page.getByRole("heading", { name: /What can hurt today\?/ })).toBeVisible();

  // 5. Claim the refund call and the ice machine task
  const refund = page.getByRole("article", { name: "Table 12 refund still not received" });
  await refund.getByRole("button", { name: "Claim" }).click();
  await expect(refund.getByText(/Claimed · Luis/)).toBeVisible();
  const ice = page.getByRole("article", { name: "Ice machine grinding again" });
  await ice.getByRole("button", { name: "Claim" }).click();
  await expect(ice.getByText(/Claimed · Luis/)).toBeVisible();

  // ...and resolve the refund call
  await refund.getByRole("button", { name: "Resolve" }).click();
  await page.getByLabel("What did you do? (optional)").fill("Called at 9:40. The processor confirmed the refund posts today.");
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(refund.getByText(/Done · Luis/)).toBeVisible();

  // 6. Discover the recurring ice machine problem
  await ice.getByRole("link", { name: /6th mention in 9 days/ }).click();
  await expect(page.getByRole("heading", { name: "Downtown ice machine mentioned 6 times in 9 days" })).toBeVisible();
  await expect(page.getByText("5 of 6 mentions were after 8 PM.", { exact: false }).first()).toBeVisible();

  // 7. The explainer
  await page.goto("/explainer");
  await expect(page.getByRole("heading", { name: "The 45-second version" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /16:9/ })).toBeVisible();
});

test("offline capture queues on the device and syncs on reconnect", async ({ page }) => {
  await page.goto("/capture");
  await page.getByLabel("Open demo controls").click();
  await page.getByRole("switch", { name: /Offline mode/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Demo shortcut/ }).click();
  await page.getByRole("button", { name: "Save closeout on this device" }).click();
  await expect(page.getByRole("heading", { name: "Saved on this phone" })).toBeVisible();
  await expect(page.getByText("1 closeout waiting to sync")).toBeVisible();
  await page.getByLabel("Open demo controls").click();
  await page.getByRole("switch", { name: /Offline mode/ }).click();
  await expect(page.getByText("Back online", { exact: true })).toBeVisible();
  await page.goto("/handoffs");
  await expect(page.getByText(/2 to confirm/).first()).toBeVisible();
});

test("a kitchen lead can't open rules, and is told why", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Enter as Bri/ }).click();
  await expect(page).toHaveURL(/\/briefing$/);
  await page.goto("/rules");
  await expect(page.getByText("Restricted area")).toBeVisible();
  await expect(page.getByRole("heading", { name: /managed by your area manager/ })).toBeVisible();
});
