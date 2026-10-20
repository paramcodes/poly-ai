import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Integration tests talk to a real Postgres and a real auth flow, so they are
// opt-in: `pnpm test:integration`. The default `pnpm test` stays hermetic.
const integration = process.env.VITEST_INTEGRATION === "1";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
		},
	},
	test: {
		globals: true,
		environment: integration ? "node" : "jsdom",
		setupFiles: integration ? [] : ["./tests/setup.ts"],
		include: integration
			? ["tests/integration/**/*.test.ts"]
			: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
		passWithNoTests: true,
	},
});
