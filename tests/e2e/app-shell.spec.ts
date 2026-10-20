import { type BrowserContext, expect, test } from "@playwright/test";

const MOCK_COOKIE = {
	name: "better-auth.session_token",
	value: "mock-session-token-for-e2e",
	domain: "127.0.0.1",
	path: "/",
	httpOnly: true,
	sameSite: "Lax" as const,
};

async function setMockAuthCookie(context: BrowserContext) {
	await context.addCookies([MOCK_COOKIE]);
}

test.describe("app shell and categories", () => {
	test("redirects unauthenticated user accessing /app to /sign-in", async ({
		page,
	}) => {
		await page.goto("/app");
		await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fapp/);
		await expect(
			page.getByText("Sign in to Poly-AI", { exact: false }),
		).toBeVisible();
	});

	test("redirects unauthenticated user accessing /app/text to /sign-in", async ({
		page,
	}) => {
		await page.goto("/app/text");
		await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fapp%2Ftext/);
		await expect(
			page.getByText("Sign in to Poly-AI", { exact: false }),
		).toBeVisible();
	});

	test("redirects authenticated user accessing /app to /app/text", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		await page.goto("/app");
		await expect(page).toHaveURL(/\/app\/text$/);
	});

	test("renders brand mark and all 5 category items in the sidebar", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		await page.goto("/app/text");

		// Brand mark
		await expect(
			page.getByRole("link", { name: "Poly-AI" }).first(),
		).toBeVisible();

		// All 5 categories
		const expectedCategories = ["Text", "Image", "Video", "Music", "Website"];
		for (const category of expectedCategories) {
			const link = page.getByRole("link", { name: category });
			await expect(link).toBeVisible();
		}

		// Settings link
		await expect(
			page.getByRole("link", { name: "Providers & Models", exact: true }),
		).toBeVisible();
	});

	test("navigating between categories updates route and active state", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		await page.goto("/app/text");

		// Initially on /app/text with Text active
		const textLink = page.getByRole("link", { name: "Text" });
		await expect(textLink).toHaveAttribute("data-active", "true");

		// Navigate to Image
		const imageLink = page.getByRole("link", { name: "Image" });
		await imageLink.click();
		await expect(page).toHaveURL(/\/app\/image$/);
		await expect(imageLink).toHaveAttribute("data-active", "true");
		await expect(textLink).toHaveAttribute("data-active", "false");
		await expect(
			page.getByRole("heading", { name: "Image", level: 1 }),
		).toBeVisible();

		// Navigate to Website
		const websiteLink = page.getByRole("link", { name: "Website" });
		await websiteLink.click();
		await expect(page).toHaveURL(/\/app\/website$/);
		await expect(websiteLink).toHaveAttribute("data-active", "true");
		await expect(imageLink).toHaveAttribute("data-active", "false");
		await expect(
			page.getByRole("heading", { name: "Website", level: 1 }),
		).toBeVisible();
	});

	test("sidebar collapse toggle collapses and expands sidebar and updates sidebar_state cookie", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		await page.goto("/app/text");

		const trigger = page.getByRole("button", { name: "Toggle Sidebar" });
		await expect(trigger).toBeVisible();

		// Initially expanded
		const sidebar = page.locator("[data-state='expanded']").first();
		await expect(sidebar).toBeVisible();

		// Click to collapse
		await trigger.click();
		await expect(
			page.locator("[data-state='collapsed']").first(),
		).toBeVisible();

		// Verify cookie updated to false
		let cookies = await context.cookies();
		let sidebarCookie = cookies.find((c) => c.name === "sidebar_state");
		expect(sidebarCookie?.value).toBe("false");

		// Click to expand again
		await trigger.click();
		await expect(page.locator("[data-state='expanded']").first()).toBeVisible();

		// Verify cookie updated to true
		cookies = await context.cookies();
		sidebarCookie = cookies.find((c) => c.name === "sidebar_state");
		expect(sidebarCookie?.value).toBe("true");
	});

	test("renders persistent empty state card with CTA when no active models configured", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		await page.goto("/app/text");

		const emptyCard = page.locator("[data-slot='category-empty-state']");
		await expect(emptyCard).toBeVisible();
		await expect(
			emptyCard.getByText("No models configured for Text"),
		).toBeVisible();
		await expect(
			emptyCard.getByText(
				"No active models are configured for Text. Configure a provider and enable models in Settings to get started.",
			),
		).toBeVisible();

		const cta = emptyCard.getByRole("link", {
			name: "Configure Providers & Models",
		});
		await expect(cta).toBeVisible();
		await expect(cta).toHaveAttribute("href", "/settings/providers");
	});

	test("emits amber warning toast notification for unconfigured category", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		await page.goto("/app/text");

		const toast = page.locator("[data-sonner-toast][data-type='warning']");
		await expect(toast).toBeVisible();
		await expect(toast).toContainText("No models configured for Text");
	});

	test("navigating to invalid category returns 404", async ({
		context,
		page,
	}) => {
		await setMockAuthCookie(context);
		const response = await page.goto("/app/invalid-category");
		expect(response?.status()).toBe(404);
		await expect(page.getByText(/404|not found/i).first()).toBeVisible();
	});
});
