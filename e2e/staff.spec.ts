import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS === "1";

test.setTimeout(90_000);

async function snap(page: Page, name: string) {
  if (!SHOTS) return;
  const project = test.info().project.name;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e-shots/staff-${project}/${name}.png`, fullPage: false });
}

async function signInAndStart(page: Page) {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/sign-in/);
  await snap(page, "01-sign-in");
  await page.getByRole("button", { name: /Demo mode/ }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /Start shift at Counter/ })).toBeVisible();
  await snap(page, "02-start");
  await page.getByRole("button", { name: /Start shift at Counter/ }).click();
  await expect(page).toHaveURL(/\/staff\/counter/);
}

async function demo(page: Page, name: RegExp | string) {
  await page.getByRole("button", { name: "Open demo tools" }).click();
  await page.getByRole("button", { name }).click();
  await page.keyboard.press("Escape");
}

test("staff: wrong PIN is refused, then sign in, call, serve, break, walk-in, today", async ({ page }) => {
  await page.goto("/staff/sign-in");
  await page.getByLabel("Employee ID").fill("E48213");
  await page.locator("#staff-pin").fill("1111");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await signInAndStart(page);
  await expect(page.getByRole("heading", { name: /Counter \d/ })).toBeVisible();
  await snap(page, "03-counter-ready");

  await page.getByRole("button", { name: /^Call next/ }).click();
  await expect(page.getByLabel("Serving now").or(page.getByLabel("Called"))).toBeVisible();
  await snap(page, "04-called");
  await demo(page, /reaches the counter now/);
  await expect(page.getByLabel("Serving now")).toBeVisible();
  await snap(page, "05-serving");

  await page.getByRole("button", { name: "Note" }).click();
  await page.getByRole("textbox").fill("Needs passbook update");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText(/note: Needs passbook update/)).toBeVisible();

  await page.getByRole("button", { name: /^Call next|^Finish/ }).click();

  await snap(page, "06-after-call");

  // Walk-in
  await page.goto("/staff/walk-in");
  await page.getByLabel("Name (optional)").fill("Ramesh");
  await page.getByRole("radio").first().click();
  await snap(page, "07-walk-in");
  await page.getByRole("button", { name: "Issue token" }).click();
  await expect(page.getByLabel("Token issued")).toBeVisible();
  await snap(page, "08-issued");
  await page.getByRole("button", { name: "Add another" }).click();

  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await snap(page, "09-queue");

  await page.goto("/staff/today");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await snap(page, "10-today");
});

test("staff: break pauses the counter and resume brings it back", async ({ page }) => {
  await signInAndStart(page);
  await page.getByRole("radio", { name: "tea" }).click();
  await expect(page.getByLabel("Paused")).toBeVisible();
  await snap(page, "11-break");
  await page.getByRole("button", { name: "Resume counter" }).click();
  await expect(page.getByLabel("Paused")).toHaveCount(0);
});

test("customer to staff: a customer joins, staff call them from the queue, the customer sees it", async ({ page, context }) => {
  await page.goto("/b/sbi/main-road");
  await page.getByRole("link", { name: "Share location and join" }).click();
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("What should we call you?").fill("Suman");
  await page.getByRole("button", { name: /Demo mode: your code is/ }).click();
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.getByRole("radio", { name: /Cash deposit or withdrawal/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Join the queue" }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Show this at the counter if asked.")).toBeVisible();
  await expect(page).toHaveURL(/\/token\//);
  const code = decodeURIComponent(page.url().split("/token/")[1] ?? "").split(/[?#]/)[0];
  expect(code).toBeTruthy();
  await page.getByRole("button", { name: "Follow my place" }).click();
  await expect(page.getByText(/people? ahead of you/)).toBeVisible();

  const staff = await context.newPage();
  await staff.goto("/staff/sign-in");
  await staff.getByRole("button", { name: /Demo mode/ }).click();
  await staff.getByRole("button", { name: "Sign in" }).click();
  await staff.getByRole("button", { name: /Start shift at Counter/ }).click();
  await expect(staff).toHaveURL(/\/staff\/counter/);
  await staff.goto("/staff/queue");
  await staff.getByRole("button", { name: new RegExp(`${code}`) }).click();
  await staff.getByRole("button", { name: `Call ${code}` }).click();
  await snap(staff, "12-after-call-from-queue");
  await staff.goto("/staff/counter");
  await snap(staff, "13-counter-with-customer");
  await expect(staff.getByLabel("Called").or(staff.getByLabel("Serving now"))).toBeVisible();
  await expect(staff.getByLabel("Called").or(staff.getByLabel("Serving now")).getByText(code as string)).toBeVisible();

  await page.bringToFront();
  await expect(page.getByRole("heading", { name: /Your turn/ })).toBeVisible({ timeout: 15_000 });
  await snap(page, "14-customer-sees-call");
});

test("one queue: the customer's place is the real queue and moves when staff call people", async ({ page, context }) => {
  const staff = await context.newPage();
  await staff.goto("/staff/sign-in");
  await staff.getByRole("button", { name: /Demo mode/ }).click();
  await staff.getByRole("button", { name: "Sign in" }).click();
  await staff.getByRole("button", { name: /Start shift at Counter/ }).click();
  await expect(staff).toHaveURL(/\/staff\/counter/);

  await page.goto("/b/sbi/main-road");
  await page.getByRole("link", { name: "Share location and join" }).click();
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await page.getByLabel("Mobile number").fill("9876543210");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("What should we call you?").fill("Suman");
  await page.getByRole("button", { name: /Demo mode: your code is/ }).click();
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.getByRole("radio", { name: /Cash deposit or withdrawal/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Join the queue" }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await page.getByRole("button", { name: "Follow my place" }).click();
  const ahead = async () => Number((await page.getByText(/\d+ (people|person) ahead of you/).first().innerText()).match(/(\d+)/)?.[1]);
  await expect(page.getByText(/(people|person) ahead of you/).first()).toBeVisible();
  const before = await ahead();
  expect(before).toBeGreaterThan(0);

  // Staff call the next person in the cash queue. The customer is behind them, so they move up by one.
  await staff.goto("/staff/counter");
  await staff.getByRole("button", { name: /^Call next/ }).click();
  await expect(staff.getByLabel("Serving now")).toBeVisible();
  await page.bringToFront();
  await expect.poll(ahead, { timeout: 15_000 }).toBe(before - 1);
});
