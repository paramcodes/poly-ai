import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: "./tests/e2e",
	outputDir: "./test-results",
	fullyParallel: false,
	// The box has limited CPU; one worker at a time keeps the run predictable.
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		// `next start` needs a build. CI builds first; locally, run `pnpm build`
		// before `pnpm test:e2e`, or the server will fail to start.
		command: `pnpm exec next start --port ${PORT}`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			BETTER_AUTH_SECRET:
				process.env.BETTER_AUTH_SECRET ||
				"mock-better-auth-secret-32-chars-long-abcdef",
			KEY_ENCRYPTION_SECRET:
				process.env.KEY_ENCRYPTION_SECRET ||
				"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
			NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
		},
	},
});
