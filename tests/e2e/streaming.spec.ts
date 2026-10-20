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
	"x-vercel-ai-ui-message-stream": "v1",
};

function createSSEStream(textChunks: string[]): string {
	const lines: string[] = [
		'data: {"type":"start"}',
		'data: {"type":"start-step"}',
		'data: {"type":"text-start","id":"msg-stream-1"}',
	];

	for (const chunk of textChunks) {
		lines.push(
			`data: ${JSON.stringify({
				type: "text-delta",
				id: "msg-stream-1",
				delta: chunk,
			})}`,
		);
	}

	lines.push(
		'data: {"type":"text-end","id":"msg-stream-1"}',
		'data: {"type":"finish-step"}',
		'data: {"type":"finish"}',
		"data: [DONE]",
		"",
	);

	return lines.join("\n\n");
}

async function setupMockSession(context: BrowserContext) {
	await context.addCookies([MOCK_COOKIE]);
}

test.describe("streaming generations", () => {
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
	});

	test.describe("text streaming flow (/app/text)", () => {
		test("streams text chunks and renders assistant response with interactive controls", async ({
			page,
		}) => {
			// Mock active text model
			await page.route("**/api/models?category=text*", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						models: [
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
						],
					}),
				});
			});

			let requestBody: Record<string, unknown> | null = null;
			await page.route("**/api/generate/text", async (route) => {
				if (route.request().method() === "POST") {
					requestBody = route.request().postDataJSON();
					const streamBody = createSSEStream([
						"Poly-AI delivers ",
						"high-performance AI streaming ",
						"across all major model providers.",
					]);
					await route.fulfill({
						status: 200,
						headers: SSE_HEADERS,
						body: streamBody,
					});
				} else {
					await route.continue();
				}
			});

			await page.goto("/app/text");

			// Initial state
			await expect(page.getByText("Ready to generate")).toBeVisible();
			const textarea = page.locator("#prompt-input");
			await expect(textarea).toBeVisible();

			// Fill prompt and submit
			await textarea.fill("Describe Poly-AI streaming capabilities.");
			const submitButton = page.getByRole("button", {
				name: /generate/i,
			});
			await expect(submitButton).toBeEnabled();
			await submitButton.click();

			// Verify request payload contained model and provider metadata
			await expect
				.poll(() => requestBody)
				.toMatchObject({
					providerId: "openai-provider",
					modelId: "gpt-4o",
				});

			// Verify streamed response appears in chat
			const assistantMessage = page.locator(
				"[data-role='assistant'], [data-slot='bubble']",
			);
			await expect(assistantMessage.first()).toBeVisible();
			await expect(
				page.getByText(
					"Poly-AI delivers high-performance AI streaming across all major model providers.",
				),
			).toBeVisible();

			// Copy button should be visible and interactive
			const copyButton = page
				.getByRole("button", {
					name: /copy/i,
				})
				.first();
			await expect(copyButton).toBeVisible();
			await copyButton.click();

			// Clear chat button should be available and reset messages
			const clearButton = page.getByRole("button", { name: "Clear chat" });
			await expect(clearButton).toBeVisible();
			await clearButton.click();
			await expect(page.getByText("Ready to generate")).toBeVisible();
		});
	});

	test.describe("website generation flow (/app/website)", () => {
		const MOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Poly-AI Preview App</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; background: #f8fafc; color: #0f172a; }
    h1 { font-size: 1.875rem; font-weight: 700; color: #4f46e5; }
    p { margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div id="root">
    <h1>Welcome to Poly-AI Generated Site</h1>
    <p>A self-contained, responsive prototype generated via AI SDK v7.</p>
    <button id="cta-btn" onclick="document.getElementById('status').textContent = 'Action clicked!'">Click Me</button>
    <div id="status">Ready</div>
  </div>
</body>
</html>`;

		test.beforeEach(async ({ page }) => {
			// Mock active website model
			await page.route("**/api/models?category=website*", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						models: [
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
						],
					}),
				});
			});

			await page.route("**/api/generate/website", async (route) => {
				if (route.request().method() === "POST") {
					const streamBody = createSSEStream(["```html\n", MOCK_HTML, "\n```"]);
					await route.fulfill({
						status: 200,
						headers: SSE_HEADERS,
						body: streamBody,
					});
				} else {
					await route.continue();
				}
			});
		});

		test("streams HTML, renders sandboxed iframe, toggles device widths, and interacts with code pane", async ({
			page,
		}) => {
			await page.goto("/app/website");

			// Workspace panels exist
			const promptInput = page.getByRole("textbox", {
				name: "Website prompt",
			});
			await expect(promptInput).toBeVisible();

			const previewContainer = page.locator('[data-testid="website-preview"]');
			await expect(previewContainer).toBeVisible();

			// Submit website generation prompt
			await promptInput.fill(
				"Create a landing page with a hero header and a CTA button",
			);
			const generateBtn = page.getByRole("button", {
				name: /generate/i,
			});
			await expect(generateBtn).toBeEnabled();
			await generateBtn.click();

			// Verify sandboxed iframe renders HTML
			const iframe = page.locator('iframe[title="Website Preview"]');
			await expect(iframe).toBeVisible();
			await expect(iframe).toHaveAttribute(
				"sandbox",
				"allow-scripts allow-forms allow-popups",
			);

			// Check iframe srcdoc contains generated content
			await expect(iframe).toHaveAttribute(
				"srcdoc",
				/Welcome to Poly-AI Generated Site/,
			);

			// Check inside iframe frameLocator
			const iframeContent = page.frameLocator(
				'iframe[title="Website Preview"]',
			);
			await expect(
				iframeContent.getByRole("heading", {
					name: "Welcome to Poly-AI Generated Site",
				}),
			).toBeVisible();

			// 3. Test device width toggles on website preview
			const frameContainer = page.locator(
				'[data-testid="preview-frame-container"]',
			);
			await expect(frameContainer).toHaveAttribute("data-device", "desktop");

			// Switch to Tablet (768px)
			const tabletBtn = page
				.getByRole("button", { name: "Tablet (768px)" })
				.first();
			await tabletBtn.click();
			await expect(frameContainer).toHaveAttribute("data-device", "tablet");

			// Switch to Mobile (390px)
			const mobileBtn = page
				.getByRole("button", { name: "Mobile (390px)" })
				.first();
			await mobileBtn.click();
			await expect(frameContainer).toHaveAttribute("data-device", "mobile");

			// Switch back to Desktop (1280px)
			const desktopBtn = page
				.getByRole("button", { name: "Desktop (1280px)" })
				.first();
			await desktopBtn.click();
			await expect(frameContainer).toHaveAttribute("data-device", "desktop");

			// 4. Test Code tab copy/download buttons exist and are interactive
			const codeTab = page.getByRole("tab", { name: /Code/i });
			await expect(codeTab).toBeVisible();
			await codeTab.click();

			const codeView = page.locator('[data-testid="website-code-view"]');
			await expect(codeView).toBeVisible();
			await expect(
				codeView.getByText("Welcome to Poly-AI Generated Site"),
			).toBeVisible();

			// Test Copy button in header
			const copyButton = page.getByRole("button", {
				name: /Copy to clipboard|Copy/i,
			});
			await expect(copyButton).toBeVisible();
			await expect(copyButton).toBeEnabled();
			await copyButton.click();

			// Test Download button in header
			const downloadButton = page.getByRole("button", {
				name: /Download \.html file|Download/i,
			});
			await expect(downloadButton).toBeVisible();
			await expect(downloadButton).toBeEnabled();
			await downloadButton.click();

			// Switch back to Preview tab
			const previewTab = page.getByRole("tab", { name: /Preview/i });
			await previewTab.click();
			await expect(previewContainer).toBeVisible();
		});
	});
});
