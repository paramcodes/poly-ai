import { describe, expect, it } from "vitest";
import {
	loadFallbackSnapshot,
	normalizeCatalogue,
} from "../../src/server/catalogue";

describe("catalogue service", () => {
	it("normalizes upstream catalogue format into poly-ai catalogue response", () => {
		const raw = {
			testprovider: {
				id: "testprovider",
				name: "Test Provider",
				env: ["TEST_KEY"],
				api: "https://api.test.com/v1",
				models: {
					"test-text": {
						id: "test-text",
						name: "Test Text Model",
						modalities: {
							input: ["text"],
							output: ["text"],
						},
					},
					"test-image": {
						id: "test-image",
						name: "Test Image Model",
						modalities: {
							input: ["text"],
							output: ["image"],
						},
					},
				},
			},
		};

		const res = normalizeCatalogue(raw, "live");
		expect(res.source).toBe("live");
		expect(res.providers).toHaveLength(1);

		const p = res.providers[0];
		expect(p.id).toBe("testprovider");
		expect(p.name).toBe("Test Provider");
		expect(p.env).toEqual(["TEST_KEY"]);
		expect(p.models).toHaveLength(2);

		const textModel = p.models.find((m) => m.id === "test-text");
		expect(textModel).toBeDefined();
		expect(textModel?.categories).toEqual(["text", "website"]);

		const imageModel = p.models.find((m) => m.id === "test-image");
		expect(imageModel).toBeDefined();
		expect(imageModel?.categories).toEqual(["image"]);
	});

	it("loads and parses the fallback snapshot successfully", () => {
		const snapshot = loadFallbackSnapshot();
		expect(snapshot.source).toBe("snapshot");
		expect(snapshot.providers.length).toBeGreaterThan(100);

		// Lilac or OpenAI should be in the snapshot
		const openai = snapshot.providers.find((p) => p.id === "openai");
		expect(openai).toBeDefined();
		expect(openai?.models.length).toBeGreaterThan(0);
	});
});
