import { expect, test } from "@playwright/test";

/**
 * Phase 0 ships one user-facing surface: the landing page.
 *
 * These tests cover the three things a reviewer would otherwise have to
 * check by hand — the page renders, the category launcher lists all five
 * categories, and the theme toggle actually changes the theme.
 */

test.describe("landing page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("renders the hero and the product name", async ({ page }) => {
		await expect(page).toHaveTitle(/Poly-AI/);
		await expect(
			page.getByRole("heading", { name: /every model you own/i }),
		).toBeVisible();
	});

	test("lists every generation category in the launcher", async ({ page }) => {
		const categories = ["Text", "Image", "Video", "Music", "Website"];
		const launcher = page.locator("#categories");

		for (const category of categories) {
			await expect(launcher.getByText(category, { exact: true })).toBeVisible();
		}
	});

	test("shows the application shell preview", async ({ page }) => {
		await expect(page.getByText("poly-ai.app/app/website")).toBeVisible();
	});
});

test.describe("theme toggle", () => {
	test("switches between the dark and light themes", async ({ page }) => {
		await page.goto("/");

		const html = page.locator("html");
		const toggle = page.getByRole("button", { name: /toggle colour theme/i });

		// The app themes itself with a class on <html>, not with
		// `prefers-color-scheme`, so the class is what proves the toggle works.
		await expect(html).toHaveClass(/\bdark\b/);

		await toggle.click();
		await expect(html).not.toHaveClass(/\bdark\b/);

		await toggle.click();
		await expect(html).toHaveClass(/\bdark\b/);
	});
});
