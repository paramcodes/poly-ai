import { expect, test } from "@playwright/test";

test.describe("auth and proxy routing", () => {
	test("redirects unauthenticated user accessing /app/text to /sign-in", async ({
		page,
	}) => {
		await page.goto("/app/text");
		await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fapp%2Ftext/);
		await expect(
			page.getByText("Sign in to Poly-AI", { exact: false }),
		).toBeVisible();
	});

	test("redirects unauthenticated user accessing /settings/providers to /sign-in", async ({
		page,
	}) => {
		await page.goto("/settings/providers");
		await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fsettings%2Fproviders/);
		await expect(
			page.getByText("Sign in to Poly-AI", { exact: false }),
		).toBeVisible();
	});

	test("renders sign-in page with email, password and OAuth options", async ({
		page,
	}) => {
		await page.goto("/sign-in");
		await expect(
			page.getByText("Sign in to Poly-AI", { exact: false }),
		).toBeVisible();
		await expect(page.getByLabel("Email")).toBeVisible();
		await expect(page.getByLabel("Password")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /^sign in$/i }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: /github/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
	});

	test("renders sign-up page with name, email, password and OAuth options", async ({
		page,
	}) => {
		await page.goto("/sign-up");
		await expect(
			page.getByText("Create an account", { exact: false }),
		).toBeVisible();
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("Email")).toBeVisible();
		await expect(page.getByLabel("Password")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /^create account$/i }),
		).toBeVisible();
	});
});
