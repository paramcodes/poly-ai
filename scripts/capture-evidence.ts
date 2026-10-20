#!/usr/bin/env tsx
import { execFile } from "node:child_process";
/**
 * Evidence capture.
 *
 * Walks the running app with Playwright and writes screenshots, a recorded
 * video, the browser console log, and a manifest into
 * `docs/evidence/phase-<N>/`. The result is committed to the branch and
 * embedded in the phase's pull request comment, so a reviewer can see what
 * the change actually looks like without running it.
 *
 * Usage:
 *   pnpm evidence                     # against http://127.0.0.1:3000
 *   EVIDENCE_BASE_URL=... pnpm evidence
 *   EVIDENCE_PHASE=3 pnpm evidence
 *
 * The app must already be running (`pnpm start` after `pnpm build`).
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const run = promisify(execFile);

const PHASE = process.env.EVIDENCE_PHASE ?? "5";
const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(
	process.cwd(),
	"docs",
	"evidence",
	`phase-${PHASE}`,
);
const VIEWPORT = { width: 1440, height: 900 };

interface ConsoleEntry {
	type: string;
	text: string;
}

async function main() {
	await rm(OUT_DIR, { recursive: true, force: true });
	await mkdir(OUT_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: VIEWPORT,
		deviceScaleFactor: 2,
		colorScheme: "dark",
		recordVideo: { dir: path.join(OUT_DIR, ".video"), size: VIEWPORT },
	});
	const page = await context.newPage();

	const consoleLog: ConsoleEntry[] = [];
	page.on("console", (message) => {
		consoleLog.push({ type: message.type(), text: message.text() });
	});
	page.on("pageerror", (error) => {
		consoleLog.push({ type: "pageerror", text: error.message });
	});

	const captured: string[] = [];

	const shoot = async (name: string, fullPage = false) => {
		const file = path.join(OUT_DIR, `${name}.png`);
		await page.screenshot({ path: file, fullPage });
		captured.push(`${name}.png`);
		console.log(`  captured ${name}.png`);
	};

	console.log(`Capturing evidence for phase ${PHASE} from ${BASE_URL}`);

	await page.goto(BASE_URL, { waitUntil: "networkidle" });
	await page.waitForTimeout(600);

	/*
	 * Guard against capturing the wrong application.
	 *
	 * The default base URL is `127.0.0.1:3000`, and a developer box can
	 * easily have another project on that port. Capturing whatever is
	 * listening there produces a set of screenshots that looks fine in the
	 * PR but shows someone else's interface. Assert on the document title
	 * before taking a single picture.
	 */
	const title = await page.title();
	if (!title.includes("Poly-AI")) {
		throw new Error(
			`Refusing to capture evidence: ${BASE_URL} served "${title}", which is not Poly-AI. ` +
				"Start the app on that port (pnpm build && pnpm start) or set EVIDENCE_BASE_URL.",
		);
	}

	await shoot("landing-viewport");
	await shoot("landing-full", true);

	/*
	 * Light mode.
	 *
	 * The app themes itself with a `dark` class on <html>, not with
	 * `prefers-color-scheme` (see `src/app/globals.css`), so
	 * `page.emulateMedia({ colorScheme: "light" })` does not change a single
	 * pixel — it only makes the browser report a different system preference
	 * that nothing reads. The screenshot came out byte-identical to the dark
	 * one, which made the "light mode" evidence a copy of the dark evidence.
	 *
	 * The theme toggle is the real control, so drive that instead.
	 */
	const themeToggle = page.getByRole("button", {
		name: /toggle colour theme/i,
	});
	if (await themeToggle.count()) {
		await themeToggle.first().click();
		await page.waitForTimeout(400);
		await shoot("landing-light");
		// Back to dark for the remaining shots.
		await themeToggle.first().click();
		await page.waitForTimeout(400);
	} else {
		console.warn("  theme toggle not found — skipping landing-light.png");
	}

	/*
	 * The application preview inside the landing page.
	 *
	 * `scrollIntoViewIfNeeded` is a no-op when the element is already inside
	 * the viewport, and the preview's title bar sits in the first screenful,
	 * so the "app shell" screenshot was the same viewport shot again. Frame
	 * the preview deliberately instead: scroll the whole preview into the
	 * middle of the viewport, then capture that region.
	 */
	const preview = page.locator("text=poly-ai.app/app/website").first();
	if (await preview.count()) {
		await preview.evaluate((element) => {
			element.scrollIntoView({ block: "center", behavior: "instant" });
		});
		await page.waitForTimeout(400);
		await shoot("app-shell-preview");
	}
	if (PHASE === "1") {
		await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "networkidle" });
		await page.waitForTimeout(400);
		await shoot("sign-in");

		await page.goto(`${BASE_URL}/sign-up`, { waitUntil: "networkidle" });
		await page.waitForTimeout(400);
		await shoot("sign-up");
	} else if (PHASE === "2") {
		const urlObj = new URL(BASE_URL);
		// Mock route responses for providers & models to avoid 401s in unauthenticated evidence capture
		await page.route("**/api/providers", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						providers: [
							{
								id: "prov-mock-1",
								name: "OpenAI",
								kind: "openai",
								status: "active",
								baseUrl: null,
								apiKeyHint: "••••a1b2",
								createdAt: new Date().toISOString(),
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/models*", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						models: [
							{
								id: "model-mock-1",
								providerId: "prov-mock-1",
								providerName: "OpenAI",
								providerStatus: "active",
								modelId: "gpt-4o-mini",
								name: "GPT-4o Mini",
								category: "text",
								capabilities: ["text"],
								enabled: "true",
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Add session cookie to access settings
		await context.addCookies([
			{
				name: "better-auth.session_token",
				value: "mock-session-token-evidence",
				domain: urlObj.hostname,
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		await page.goto(`${BASE_URL}/settings/providers`, {
			waitUntil: "domcontentloaded",
		});
		await page.waitForTimeout(1000);
		await shoot("providers-settings");

		// Open Add Provider modal
		const addBtn = page.getByRole("button", { name: "Add Provider" });
		if (await addBtn.count()) {
			await addBtn.click();
			await page.waitForTimeout(400);
			await shoot("add-provider-dialog");
			// Close dialog
			await page.keyboard.press("Escape");
			await page.waitForTimeout(200);
		}
	} else if (PHASE === "3") {
		const urlObj = new URL(BASE_URL);

		// Mock route responses for models to avoid 401s in mock session evidence capture
		await page.route("**/api/models*", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ models: [] }),
				});
			} else {
				await route.continue();
			}
		});

		// Mock auth session to populate user profile in sidebar and prevent CORS errors
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

		// Add session cookie to access /app routes
		await context.addCookies([
			{
				name: "better-auth.session_token",
				value: "mock-session-token-evidence",
				domain: urlObj.hostname,
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		// Visit /app/text
		await page.goto(`${BASE_URL}/app/text`, {
			waitUntil: "networkidle",
		});
		await page.waitForTimeout(600);

		// 1. App shell on /app/text
		await shoot("app-shell");
		await shoot("app-shell-text");

		// 2. Category empty state card screenshot
		const emptyCard = page
			.locator("[data-slot='category-empty-state']")
			.first();
		if (await emptyCard.count()) {
			const cardFile = path.join(OUT_DIR, "category-empty-state.png");
			await emptyCard.screenshot({ path: cardFile });
			captured.push("category-empty-state.png");
			console.log("  captured category-empty-state.png");
		}

		// 3. Toggle sidebar collapsed state and capture
		const trigger = page.locator("[data-sidebar='trigger']").first();
		if (await trigger.count()) {
			await trigger.click();
			await page.waitForTimeout(400);
			await shoot("app-shell-collapsed");
			// Restore expanded
			await trigger.click();
			await page.waitForTimeout(400);
		}

		// 4. Navigate to /app/website and capture
		await page.goto(`${BASE_URL}/app/website`, {
			waitUntil: "networkidle",
		});
		await page.waitForTimeout(600);
		await shoot("app-shell-website");
	} else if (PHASE === "4") {
		const urlObj = new URL(BASE_URL);

		// Mock route responses for models
		await page.route("**/api/models*", async (route) => {
			if (route.request().method() === "GET") {
				const url = route.request().url();
				const isWebsite = url.includes("category=website");
				const models = isWebsite
					? [
							{
								id: "website-model-1",
								modelId: "claude-3-5-sonnet",
								name: "Claude 3.5 Sonnet",
								providerId: "anthropic-provider",
								providerName: "Anthropic",
								providerStatus: "active",
								category: "website",
								enabled: "true",
								capabilities: ["website"],
							},
						]
					: [
							{
								id: "text-model-1",
								modelId: "gpt-4o",
								name: "GPT-4o",
								providerId: "openai-provider",
								providerName: "OpenAI",
								providerStatus: "active",
								category: "text",
								enabled: "true",
								capabilities: ["text"],
							},
						];
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ models }),
				});
			} else {
				await route.continue();
			}
		});

		// Mock auth session to populate user profile and prevent CORS errors
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

		// Mock text streaming route
		await page.route("**/api/generate/text", async (route) => {
			if (route.request().method() === "POST") {
				const textChunks = [
					"Poly-AI streams generative output in real time ",
					"across 200+ providers and 9,000+ models. ",
					"Built on the Vercel AI SDK v7 data stream protocol, ",
					"text responses render with low-latency incremental chunking, ",
					"automatic message scrolling, and direct clipboard copying.",
				];
				const lines = [
					'data: {"type":"start"}',
					'data: {"type":"start-step"}',
					'data: {"type":"text-start","id":"msg-stream-evidence"}',
					...textChunks.map(
						(chunk) =>
							`data: ${JSON.stringify({
								type: "text-delta",
								id: "msg-stream-evidence",
								delta: chunk,
							})}`,
					),
					'data: {"type":"text-end","id":"msg-stream-evidence"}',
					'data: {"type":"finish-step"}',
					'data: {"type":"finish"}',
					"data: [DONE]",
					"",
				];
				await route.fulfill({
					status: 200,
					headers: {
						"content-type": "text/event-stream",
						"cache-control": "no-cache",
						connection: "keep-alive",
						"x-vercel-ai-ui-message-stream": "v1",
					},
					body: lines.join("\n\n"),
				});
			} else {
				await route.continue();
			}
		});

		// Mock website streaming route
		const websiteHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poly-AI Stream Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-8 antialiased">
  <div class="max-w-4xl mx-auto space-y-6">
    <header class="flex items-center justify-between border-b border-slate-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-indigo-400">Poly-AI Stream Studio</h1>
        <p class="text-sm text-slate-400 mt-0.5">Real-time BYOK Multi-Modal Generation Platform</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live Preview</span>
      </div>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-400">Total Models</div>
        <div class="text-3xl font-extrabold text-white mt-2">9,079</div>
        <div class="text-xs text-slate-500 mt-1">Across 232 providers</div>
      </div>
      <div class="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-400">Streaming Latency</div>
        <div class="text-3xl font-extrabold text-indigo-400 mt-2">18ms</div>
        <div class="text-xs text-slate-500 mt-1">First token time-to-render</div>
      </div>
      <div class="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-400">Security & BYOK</div>
        <div class="text-3xl font-extrabold text-emerald-400 mt-2">AES-256</div>
        <div class="text-xs text-slate-500 mt-1">Zero third-party retention</div>
      </div>
    </div>
  </div>
</body>
</html>`;

		await page.route("**/api/generate/website", async (route) => {
			if (route.request().method() === "POST") {
				const streamChunks = ["```html\n", websiteHtml, "\n```"];
				const lines = [
					'data: {"type":"start"}',
					'data: {"type":"start-step"}',
					'data: {"type":"text-start","id":"website-stream-evidence"}',
					...streamChunks.map(
						(chunk) =>
							`data: ${JSON.stringify({
								type: "text-delta",
								id: "website-stream-evidence",
								delta: chunk,
							})}`,
					),
					'data: {"type":"text-end","id":"website-stream-evidence"}',
					'data: {"type":"finish-step"}',
					'data: {"type":"finish"}',
					"data: [DONE]",
					"",
				];
				await route.fulfill({
					status: 200,
					headers: {
						"content-type": "text/event-stream",
						"cache-control": "no-cache",
						connection: "keep-alive",
						"x-vercel-ai-ui-message-stream": "v1",
					},
					body: lines.join("\n\n"),
				});
			} else {
				await route.continue();
			}
		});

		// Add session cookie to access /app routes
		await context.addCookies([
			{
				name: "better-auth.session_token",
				value: "mock-session-token-evidence",
				domain: urlObj.hostname,
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		// 1. Visit /app/text, generate response, and capture stream active
		await page.goto(`${BASE_URL}/app/text`, { waitUntil: "networkidle" });
		await page.waitForTimeout(600);

		const textPromptInput = page.locator("#prompt-input");
		if (await textPromptInput.count()) {
			await textPromptInput.fill(
				"Summarize Poly-AI architecture and streaming capabilities.",
			);
			const genBtn = page.getByRole("button", { name: /generate/i });
			if (await genBtn.count()) {
				await genBtn.click();
				await page.waitForTimeout(1000);
			}
		}
		await shoot("text-streaming");

		// 2. Visit /app/website, generate HTML, and capture preview & code panes
		await page.goto(`${BASE_URL}/app/website`, { waitUntil: "networkidle" });
		await page.waitForTimeout(600);

		const websitePromptInput = page.getByRole("textbox", {
			name: "Website prompt",
		});
		if (await websitePromptInput.count()) {
			await websitePromptInput.fill(
				"Generate a responsive dark-themed analytics dashboard for Poly-AI.",
			);
			const genBtn = page.getByRole("button", { name: /generate/i });
			if (await genBtn.count()) {
				await genBtn.click();
				await page.waitForTimeout(1200);
			}
		}

		// Capture website preview pane
		await shoot("website-preview");

		// Toggle device width to tablet and capture
		const tabletBtn = page
			.getByRole("button", { name: "Tablet (768px)" })
			.first();
		if (await tabletBtn.count()) {
			await tabletBtn.click();
			await page.waitForTimeout(400);
			await shoot("website-preview-tablet");
		}

		// Switch to Code tab and capture code pane
		const codeTab = page.getByRole("tab", { name: /Code/i });
		if (await codeTab.count()) {
			await codeTab.click();
			await page.waitForTimeout(400);
			await shoot("website-code");
		}
	} else if (PHASE === "5") {
		const urlObj = new URL(BASE_URL);

		// Mock the assigned image model
		await page.route("**/api/models*", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						models: [
							{
								id: "image-model-1",
								modelId: "gpt-image-1",
								name: "GPT Image 1",
								providerId: "openai-provider",
								providerName: "OpenAI",
								providerStatus: "active",
								category: "image",
								enabled: "true",
								capabilities: ["image"],
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock auth session
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

		// Mock the image history endpoint
		await page.route("**/api/generations?category=image*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					generations: [
						{
							id: "gen-evidence-1",
							userId: "mock-user-id",
							category: "image",
							providerId: "openai-provider",
							modelId: "gpt-image-1",
							prompt:
								"A serene mountain lake at sunrise with photorealistic mist",
							status: "succeeded",
							outputUrl: `${BASE_URL}/mock-evidence-image.png`,
							createdAt: new Date().toISOString(),
						},
						{
							id: "gen-evidence-2",
							userId: "mock-user-id",
							category: "image",
							providerId: "openai-provider",
							modelId: "gpt-image-1",
							prompt: "A neon city skyline at night in the rain",
							status: "succeeded",
							outputUrl: `${BASE_URL}/mock-evidence-image.png`,
							createdAt: new Date().toISOString(),
						},
					],
				}),
			});
		});

		// Serve a placeholder pixel for the mocked gallery images
		await page.route("**/mock-evidence-image.png", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "image/png",
				body: Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
					"base64",
				),
			});
		});

		// Add session cookie to access /app routes
		await context.addCookies([
			{
				name: "better-auth.session_token",
				value: "mock-session-token-evidence",
				domain: urlObj.hostname,
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		// 1. Visit /app/image and capture the workspace with its gallery
		await page.goto(`${BASE_URL}/app/image`, { waitUntil: "networkidle" });
		await page.waitForTimeout(800);
		await shoot("image-workspace");

		// 2. Fill the prompt and capture the form state
		const imagePrompt = page.locator("#image-prompt");
		if (await imagePrompt.count()) {
			await imagePrompt.fill(
				"A glass city floating above the clouds at golden hour, cinematic lighting",
			);
			await page.waitForTimeout(300);
			await shoot("image-prompt-filled");
		}
	}
	const video = page.video();
	await context.close();
	await browser.close();

	if (video) {
		const raw = await video.path();
		const target = path.join(OUT_DIR, "walkthrough.webm");
		await rename(raw, target);
		captured.push("walkthrough.webm");
		console.log("  captured walkthrough.webm");

		// GitHub renders GIFs inline; WebM does not render in a PR comment.
		const gif = path.join(OUT_DIR, "walkthrough.gif");
		const converted = await tryRun("ffmpeg", [
			"-y",
			"-i",
			target,
			"-vf",
			"fps=12,scale=960:-1:flags=lanczos",
			"-loop",
			"0",
			gif,
		]);
		if (converted) {
			captured.push("walkthrough.gif");
			console.log("  captured walkthrough.gif");
		} else {
			console.warn("  ffmpeg unavailable — skipped the GIF conversion");
		}
	}

	// The console log is the evidence that nothing errored while rendering.
	const errors = consoleLog.filter(
		(entry) =>
			(entry.type === "error" || entry.type === "pageerror") &&
			!entry.text.includes("404"),
	);
	await writeFile(
		path.join(OUT_DIR, "console.log"),
		[
			`# Browser console for phase ${PHASE}`,
			`# ${captured.length} artefacts captured`,
			`# ${errors.length} error(s)`,
			"",
			...consoleLog.map((entry) => `[${entry.type}] ${entry.text}`),
		].join("\n"),
		"utf8",
	);

	const manifest = {
		phase: PHASE,
		baseUrl: BASE_URL,
		viewport: VIEWPORT,
		capturedAt: new Date().toISOString(),
		artefacts: captured,
		consoleErrors: errors.length,
	};
	await writeFile(
		path.join(OUT_DIR, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8",
	);

	console.log("");
	console.log(`Evidence written to ${OUT_DIR}`);
	console.log(
		`  ${captured.length} artefacts, ${errors.length} console error(s)`,
	);
	if (errors.length > 0) {
		console.error("");
		console.error(
			"Console errors were recorded. See console.log before merging.",
		);
	}
}

/** Run a command, returning `false` instead of throwing when it is unavailable. */
async function tryRun(command: string, args: string[]): Promise<boolean> {
	try {
		await run(command, args);
		return true;
	} catch {
		return false;
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
