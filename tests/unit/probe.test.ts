import { describe, expect, it } from "vitest";
import { probeProvider } from "../../src/lib/probe";

describe("provider probe", () => {
	it("returns ok for mock and sk-test keys without network requests", async () => {
		const res1 = await probeProvider({
			kind: "openai",
			apiKey: "mock-valid-key",
		});
		expect(res1.ok).toBe(true);
		expect(res1.status).toBe(200);

		const res2 = await probeProvider({
			kind: "openai-compatible",
			apiKey: "sk-test-12345",
			baseUrl: "https://api.example.com/v1",
		});
		expect(res2.ok).toBe(true);
	});

	it("returns invalid status for invalid-key mock", async () => {
		const res = await probeProvider({
			kind: "openai",
			apiKey: "invalid-key",
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
		expect(res.error).toBeDefined();
	});

	it("fails gracefully when base URL is missing for custom provider", async () => {
		const res = await probeProvider({
			kind: "custom",
			apiKey: "some-real-looking-key-12345",
		});
		expect(res.ok).toBe(false);
		expect(res.error).toContain("Missing base URL");
	});
});
