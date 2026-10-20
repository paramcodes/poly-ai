import { expect, test } from "@playwright/test";

test.describe("providers and models settings", () => {
	test("requires authentication to access /settings/providers", async ({
		page,
	}) => {
		await page.goto("/settings/providers");
		await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fsettings%2Fproviders/);
		await expect(
			page.getByText("Sign in to Poly-AI", { exact: false }),
		).toBeVisible();
	});

	test("unauthenticated requests to /api/providers are rejected with 401", async ({
		request,
	}) => {
		const res = await request.get("/api/providers");
		expect(res.status()).toBe(401);
		const data = await res.json();
		expect(data.error).toBe("Unauthorized");
	});

	test("unauthenticated requests to /api/models are rejected with 401", async ({
		request,
	}) => {
		const res = await request.get("/api/models");
		expect(res.status()).toBe(401);
		const data = await res.json();
		expect(data.error).toBe("Unauthorized");
	});

	test("public catalogue endpoint /api/catalog returns normalized providers and models with 6h cache header", async ({
		request,
	}) => {
		const res = await request.get("/api/catalog");
		expect(res.status()).toBe(200);

		// Cache header check
		const cacheControl = res.headers()["cache-control"];
		expect(cacheControl).toContain("s-maxage=21600");

		const body = await res.json();
		expect(body.providers).toBeDefined();
		expect(Array.isArray(body.providers)).toBe(true);
		expect(body.providers.length).toBeGreaterThan(10);

		// Lilac or OpenAI should be in the catalogue
		const openai = body.providers.find(
			(p: { id: string }) => p.id === "openai" || p.id === "lilac",
		);
		expect(openai).toBeDefined();
		expect(openai.env.length).toBeGreaterThan(0);
		expect(openai.models.length).toBeGreaterThan(0);

		// Check capability mapping on a model
		const sampleModel = openai.models[0];
		expect(sampleModel.categories).toBeDefined();
		expect(sampleModel.modalities).toBeDefined();
	});

	test("mock authentication allows access to /settings/providers view", async ({
		context,
		page,
	}) => {
		// Set session cookie
		await context.addCookies([
			{
				name: "better-auth.session_token",
				value: "mock-session-token-for-e2e",
				domain: "127.0.0.1",
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		await page.goto("/settings/providers");
		await expect(
			page.getByRole("heading", { name: "Providers & Models" }),
		).toBeVisible();

		// Check buttons and tables render
		await expect(
			page.getByRole("button", { name: "Add Provider" }),
		).toBeVisible();
		await expect(page.getByText("Configured Providers")).toBeVisible();
		await expect(page.getByText("Model Assignment Table")).toBeVisible();

		// Open Add Provider modal
		await page.getByRole("button", { name: "Add Provider" }).click();
		await expect(page.getByText("Add API Provider")).toBeVisible();
		await expect(page.getByText("Catalogue Provider")).toBeVisible();
		await expect(page.getByText("Custom Endpoint")).toBeVisible();

		// Check that the provider select populated from /api/catalog
		const select = page.locator("#provider-select");
		await expect(select).toBeVisible();
		await expect(select.locator("option")).not.toHaveCount(0);
	});
});
