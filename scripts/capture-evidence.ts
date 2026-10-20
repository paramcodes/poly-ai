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

const PHASE = process.env.EVIDENCE_PHASE ?? "0";
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
