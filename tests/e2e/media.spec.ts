import { type BrowserContext, expect, test } from "@playwright/test";

const MOCK_COOKIE = {
	name: "better-auth.session_token",
	value: "mock-session-token-for-e2e",
	domain: "127.0.0.1",
	path: "/",
	httpOnly: true,
	sameSite: "Lax" as const,
};

/** Tiny placeholder assets, byte-identical to the mock provider's. */
const MOCK_MP4 = Buffer.from(
	"AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAHRtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAGG1kYXQAAAAAAAAAAAAAAAAAAAAA",
	"base64",
);
const MOCK_WAV = Buffer.from(
	"UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA",
	"base64",
);

const VIDEO_MODEL = {
	id: "video-model-1",
	modelId: "fal-ai/kling-video/v1",
	name: "Kling Video",
	providerId: "fal-provider",
	providerName: "fal",
	providerStatus: "active",
	category: "video",
	enabled: "true",
	capabilities: ["video"],
};

const MUSIC_MODEL = {
	id: "music-model-1",
	modelId: "fal-ai/ace-music",
	name: "ACE Music",
	providerId: "fal-provider",
	providerName: "fal",
	providerStatus: "active",
	category: "music",
	enabled: "true",
	capabilities: ["music"],
};

const VIDEO_HISTORY = [
	{
		id: "gen-video-history-1",
		category: "video",
		modelId: "fal-ai/kling-video/v1",
		prompt: "A drone shot flying over a pine forest at sunrise",
		status: "succeeded",
		outputUrl: "/mock-video.mp4",
		error: null,
		createdAt: "2024-05-01T10:00:00.000Z",
	},
];

const MUSIC_HISTORY = [
	{
		id: "gen-music-history-1",
		category: "music",
		modelId: "fal-ai/ace-music",
		prompt: "A lo-fi hip hop beat with warm rhodes and vinyl crackle",
		status: "succeeded",
		outputUrl: "/mock-audio.wav",
		error: null,
		createdAt: "2024-05-02T10:00:00.000Z",
	},
];

async function setupMockSession(context: BrowserContext) {
	await context.addCookies([MOCK_COOKIE]);
}

test.describe("media generation flows (video + music)", () => {
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

		// Mock the assigned video model
		await page.route("**/api/models?category=video*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ models: [VIDEO_MODEL] }),
			});
		});

		// Mock the assigned music model
		await page.route("**/api/models?category=music*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ models: [MUSIC_MODEL] }),
			});
		});

		// Mock the video history
		await page.route("**/api/generations?category=video*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ generations: VIDEO_HISTORY }),
			});
		});

		// Mock the music history
		await page.route("**/api/generations?category=music*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ generations: MUSIC_HISTORY }),
			});
		});

		// Serve the placeholder assets for the mocked history rows
		await page.route("**/mock-video.mp4", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "video/mp4",
				body: MOCK_MP4,
			});
		});
		await page.route("**/mock-audio.wav", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "audio/wav",
				body: MOCK_WAV,
			});
		});
	});

	test("queues a video job, polls it and renders the finished video", async ({
		page,
	}) => {
		let requestBody: Record<string, unknown> | null = null;
		let polls = 0;

		await page.route("**/api/generate/video", async (route) => {
			requestBody = route.request().postDataJSON();
			await route.fulfill({
				status: 202,
				contentType: "application/json",
				body: JSON.stringify({
					generation: { id: "gen-video-1", status: "queued" },
				}),
			});
		});

		// First poll reports "running", the second one reports the finished job.
		await page.route("**/api/generations/gen-*", async (route) => {
			polls += 1;
			const succeeded = polls > 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					generation: {
						id: "gen-video-1",
						status: succeeded ? "succeeded" : "running",
						outputUrl: succeeded ? "/mock-video.mp4" : null,
					},
				}),
			});
		});

		await page.goto("/app/video");

		const prompt = page.locator("#video-prompt");
		await expect(prompt).toBeVisible();

		// The seeded history row is listed under History.
		await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
		await expect(
			page.getByText("A drone shot flying over a pine forest at sunrise"),
		).toBeVisible();

		const generateButton = page.getByRole("button", {
			name: "Generate",
			exact: true,
		});
		await expect(generateButton).toBeDisabled();

		await prompt.fill("A glass city floating above the clouds at golden hour");
		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		// The request payload carried prompt, provider and model.
		await expect
			.poll(() => requestBody)
			.toMatchObject({
				prompt: "A glass city floating above the clouds at golden hour",
				providerId: "fal-provider",
				modelId: "fal-ai/kling-video/v1",
			});

		// The page polls the job endpoint until the job succeeds.
		await expect.poll(() => polls).toBeGreaterThan(0);

		const player = page.locator("video[aria-label='Generated video']");
		await expect(player).toBeVisible({ timeout: 30_000 });
		await expect(player).toHaveAttribute("src", "/mock-video.mp4");
	});

	test("music song mode queues a job, polls it and renders the finished track", async ({
		page,
	}) => {
		let requestBody: Record<string, unknown> | null = null;
		let polls = 0;

		await page.route("**/api/generate/music", async (route) => {
			requestBody = route.request().postDataJSON();
			await route.fulfill({
				status: 202,
				contentType: "application/json",
				body: JSON.stringify({
					generation: { id: "gen-music-1", status: "queued" },
				}),
			});
		});

		await page.route("**/api/generations/gen-*", async (route) => {
			polls += 1;
			const succeeded = polls > 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					generation: {
						id: "gen-music-1",
						status: succeeded ? "succeeded" : "running",
						outputUrl: succeeded ? "/mock-audio.wav" : null,
					},
				}),
			});
		});

		await page.goto("/app/music");

		const songButton = page.getByRole("button", { name: "Song" });
		await expect(songButton).toBeVisible();
		await expect(songButton).toHaveAttribute("aria-pressed", "true");

		const prompt = page.locator("#music-prompt");
		await expect(prompt).toBeVisible();

		await prompt.fill("A dreamy synthwave track with analog pads");
		const generateButton = page.getByRole("button", {
			name: "Generate",
			exact: true,
		});
		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		await expect
			.poll(() => requestBody)
			.toMatchObject({
				prompt: "A dreamy synthwave track with analog pads",
				providerId: "fal-provider",
				modelId: "fal-ai/ace-music",
			});
		// Song mode is the job flow — it never asks for the speech variant.
		expect(requestBody).not.toHaveProperty("mode");

		await expect.poll(() => polls).toBeGreaterThan(0);

		const player = page.locator("audio[aria-label='Generated audio']");
		await expect(player).toBeVisible({ timeout: 30_000 });
		await expect(player).toHaveAttribute("src", "/mock-audio.wav");
	});

	test("music voice mode posts mode:voice, never polls and renders an audio player", async ({
		page,
	}) => {
		let requestBody: Record<string, unknown> | null = null;
		let polls = 0;

		await page.route("**/api/generate/music", async (route) => {
			requestBody = route.request().postDataJSON();
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					generation: {
						id: "gen-music-voice-1",
						status: "succeeded",
						outputUrl: "/mock-audio.wav",
					},
				}),
			});
		});

		await page.route("**/api/generations/gen-*", async (route) => {
			polls += 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					generation: { id: "gen-music-voice-1", status: "succeeded" },
				}),
			});
		});

		await page.goto("/app/music");

		const voiceButton = page.getByRole("button", { name: "Voice" });
		await expect(voiceButton).toBeVisible();
		await voiceButton.click();
		await expect(voiceButton).toHaveAttribute("aria-pressed", "true");

		const prompt = page.locator("#music-prompt");
		await expect(prompt).toBeVisible();

		await prompt.fill("Hello from Poly-AI");
		const generateButton = page.getByRole("button", {
			name: "Generate",
			exact: true,
		});
		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		await expect
			.poll(() => requestBody)
			.toMatchObject({
				prompt: "Hello from Poly-AI",
				providerId: "fal-provider",
				modelId: "fal-ai/ace-music",
				mode: "voice",
			});

		const player = page.locator("audio[aria-label='Generated audio']");
		await expect(player).toBeVisible();
		await expect(player).toHaveAttribute("src", "/mock-audio.wav");

		// Text to speech answers immediately — the job endpoint is never polled.
		await page.waitForTimeout(6000);
		expect(polls).toBe(0);
	});
});
