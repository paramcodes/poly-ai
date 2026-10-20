import { type BrowserContext, expect, test } from "@playwright/test";

const MOCK_COOKIE = {
	name: "better-auth.session_token",
	value: "mock-session-token-for-e2e",
	domain: "127.0.0.1",
	path: "/",
	httpOnly: true,
	sameSite: "Lax" as const,
};

const SSE_HEADERS = {
	"content-type": "text/event-stream",
	"cache-control": "no-cache",
	connection: "keep-alive",
};

/** 1x1 transparent PNG, served for every mocked gallery image. */
const PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

const IMAGE_MODEL = {
	id: "image-model-1",
	modelId: "gpt-image-1",
	name: "GPT Image 1",
	providerId: "openai-provider",
	providerName: "OpenAI",
	providerStatus: "active",
	category: "image",
	enabled: "true",
	capabilities: ["image"],
};

const HISTORY_GENERATIONS = [
	{
		id: "gen-history-1",
		userId: "mock-user-id",
		category: "image",
		providerId: "openai-provider",
		modelId: "dall-e-3",
		prompt: "A serene mountain lake at sunrise with photorealistic mist",
		status: "succeeded",
		outputUrl: "http://127.0.0.1:3000/mock-image-one.png",
		error: null,
		createdAt: "2024-05-01T10:00:00.000Z",
	},
	{
		id: "gen-history-2",
		userId: "mock-user-id",
		category: "image",
		providerId: "openai-provider",
		modelId: "stable-diffusion-xl",
		prompt: "A neon city skyline at night in the rain",
		status: "succeeded",
		outputUrl: "http://127.0.0.1:3000/mock-image-two.png",
		error: null,
		createdAt: "2024-05-02T10:00:00.000Z",
	},
];

/**
 * Builds the Server-Sent Events body used by `POST /api/generate/image`.
 * The media generation endpoint emits `event: <type>` blocks, not the AI SDK
 * data stream format.
 */
function createImageSSEStream(): string {
	const blocks = [
		`event: queued\ndata: ${JSON.stringify({
			type: "queued",
			generationId: "gen-1",
		})}`,
		`event: progress\ndata: ${JSON.stringify({
			type: "progress",
			generationId: "gen-1",
			progress: 60,
			message: "Rendering image...",
		})}`,
		`event: complete\ndata: ${JSON.stringify({
			type: "complete",
			generationId: "gen-1",
			outputUrl: "http://127.0.0.1:3000/mock-generated-image.png",
		})}`,
	];

	return `${blocks.join("\n\n")}\n\n`;
}

async function setupMockSession(context: BrowserContext) {
	await context.addCookies([MOCK_COOKIE]);
}

test.describe("image generation flow (/app/image)", () => {
	test.beforeEach(async ({ context, page }) => {
		await setupMockSession(context);

		// Mock auth session to prevent CORS or auth errors
		await page.route("**/api/auth/**", async (route) => {
			await route.fulfill({
				status: 200,
				headers: {
					"access-control-allow-origin": "http://127.0.0.1:3000",
					"access-control-allow-credentials": "true",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					session: {
						id: "mock-session-id",
						userId: "mock-user-id",
						expiresAt: new Date(Date.now() + 86400000).toISOString(),
					},
					user: {
						id: "mock-user-id",
						name: "Demo User",
						email: "demo@poly-ai.app",
					},
				}),
			});
		});

		// Mock the assigned image model
		await page.route("**/api/models?category=image*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ models: [IMAGE_MODEL] }),
			});
		});

		// Mock image generation history
		await page.route("**/api/generations?category=image*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ generations: HISTORY_GENERATIONS }),
			});
		});

		// Serve placeholder pixels for every mocked gallery image
		await page.route("**/mock-*.png", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "image/png",
				body: PIXEL_PNG,
			});
		});
	});

	test("renders history, submits a prompt with model metadata, and copies a prompt", async ({
		page,
	}) => {
		let requestBody: Record<string, unknown> | null = null;
		await page.route("**/api/generate/image", async (route) => {
			if (route.request().method() === "POST") {
				requestBody = route.request().postDataJSON();
				await route.fulfill({
					status: 200,
					headers: SSE_HEADERS,
					body: createImageSSEStream(),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/app/image");

		// Workspace controls
		const prompt = page.locator("#image-prompt");
		await expect(prompt).toBeVisible();
		const generateButton = page.getByRole("button", { name: /generate/i });
		await expect(generateButton).toBeVisible();

		// Gallery shows the seeded history entries
		await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
		await expect(
			page.getByText(
				"A serene mountain lake at sunrise with photorealistic mist",
			),
		).toBeVisible();
		await expect(
			page.getByText("A neon city skyline at night in the rain"),
		).toBeVisible();

		// Model badge of the seeded cards
		await expect(page.getByText("dall-e-3").first()).toBeVisible();
		await expect(page.getByText("stable-diffusion-xl").first()).toBeVisible();

		// Submit a new prompt
		await prompt.fill("A glass city floating above the clouds");
		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		// Verify the request payload carried prompt, provider and model
		await expect
			.poll(() => requestBody)
			.toMatchObject({
				prompt: "A glass city floating above the clouds",
				providerId: "openai-provider",
				modelId: "gpt-image-1",
			});

		// Copy button is present per card and clickable
		const copyButton = page.getByRole("button", { name: /copy/i }).first();
		await expect(copyButton).toBeVisible();
		await expect(copyButton).toBeEnabled();
		await copyButton.click();
	});
});
