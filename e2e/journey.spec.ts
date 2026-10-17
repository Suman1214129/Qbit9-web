import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS === "1";

async function snap(page: Page, name: string) {
  if (!SHOTS) return;
  const project = test.info().project.name;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `e2e-shots/${project}/${name}.png`, fullPage: false });
}

async function devAction(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name: "Open developer tools" }).click();
  await page.getByRole("button", { name }).click();
  await page.keyboard.press("Escape");
}

test("customer journey: join, check in, get called, served, feedback", async ({ page }) => {
  await page.goto("/b/sbi/main-road");
  await expect(page.locator("h1", { hasText: "Main Road Branch" })).toBeVisible();
  await snap(page, "01-landing");

  await page.getByRole("link", { name: "Share location and join" }).click();
  await expect(page.getByRole("heading", { name: "You are at the branch" })).toBeVisible();
  await snap(page, "03-location-ok");
  await page.getByRole("button", { name: "Continue to sign in" }).click();

  await expect(page.getByRole("heading", { name: "Enter your mobile number" })).toBeVisible();
  await page.getByLabel("Mobile number").fill("9876543210");
  await snap(page, "06-sign-in");
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await page.getByLabel("What should we call you?").fill("Suman");
  await page.getByRole("button", { name: /Demo mode: your code is/ }).click();
  await snap(page, "07-verify");
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByRole("heading", { name: "Choose a service" }).or(page.getByRole("heading", { name: /Choose a service/ }))).toBeVisible();
  await page.getByRole("radio", { name: /Cash deposit or withdrawal/ }).click();
  await snap(page, "08-service");
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByText(/in line|You would be next/)).toBeVisible();
  await snap(page, "09-review");
  await page.getByRole("button", { name: "Join the queue" }).click();

  await expect(page.getByRole("heading", { name: "Get an alert when you are 3 away" })).toBeVisible();
  await snap(page, "10-alerts-ask");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Show this at the counter if asked.")).toBeVisible();
  await snap(page, "10b-token");
  await page.getByRole("button", { name: "Follow my place" }).click();

  await expect(page.getByText(/people? ahead of you/)).toBeVisible();
  await snap(page, "12-waiting");

  await devAction(page, "Skip to 3 away");
  await expect(page.getByRole("heading", { name: "Still at the branch?" })).toBeVisible();
  await snap(page, "13-checkin");
  await page.getByRole("button", { name: "Check in to confirm" }).click();
  await expect(page.getByText(/people? ahead of you/)).toBeVisible();

  await devAction(page, "Call me now");
  await expect(page.getByRole("heading", { name: /Your turn, Suman/ })).toBeVisible();
  await snap(page, "14-called");
  await page.getByRole("button", { name: "I am on my way" }).click();
  await page.getByRole("button", { name: "I need a few more minutes" }).click();
  await expect(page.getByRole("button", { name: "Extra time used" })).toBeVisible();

  await devAction(page, "Staff: start serving");
  await expect(page.getByRole("heading", { name: "You are being served" })).toBeVisible();
  await snap(page, "14b-serving");
  await devAction(page, "Staff: finish");

  await expect(page.getByRole("heading", { name: /Thanks, Suman/ })).toBeVisible();
  await page.getByRole("radio", { name: "Quick" }).click();
  await expect(page.getByText(/that helps other customers/)).toBeVisible();
  await snap(page, "15-complete");

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page.getByRole("heading", { name: "Hi, Suman" })).toBeVisible();
  await snap(page, "16-home");
});

test("too far, then book a visit, check history and profile", async ({ page }) => {
  await page.goto("/b/sbi/main-road");
  await page.getByRole("button", { name: "Open developer tools" }).click();
  await page.getByRole("button", { name: /Too far/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Share location and join" }).click();
  await expect(page.getByRole("heading", { name: /too far/i })).toBeVisible();
  await snap(page, "04-too-far");

  await page.getByRole("button", { name: "Open developer tools" }).click();
  await page.getByRole("button", { name: "Permission blocked" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { name: "We need your location once" })).toBeVisible();
  await snap(page, "05-blocked");

  // sign in directly, then book
  await page.goto("/sign-in");
  await page.getByLabel("Mobile number").fill("9123456789");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByRole("button", { name: /Demo mode: your code is/ }).click();
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL(/\/(home|join\/service)/);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Book a visit" })).toBeVisible();
  const free = page.getByRole("radio", { name: /\d:\d\d/ }).and(page.locator(":not([disabled])")).first();
  await free.click();
  await snap(page, "17-book");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are booked" })).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /Upcoming/ })).toBeVisible();
  await snap(page, "16b-home-upcoming");

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "Your visits" })).toBeVisible();
  await snap(page, "18-history");
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await snap(page, "19-profile");
  await page.goto("/profile/alerts");
  await snap(page, "20-alerts");
  await page.goto("/profile");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/branches$/);
  await snap(page, "00-branches");
});
