import { describe, expect, it } from "vitest";
import { getImageModel, MOCK_PNG_BASE64 } from "../../src/server/adapters";

describe("Image adapter registry", () => {
	it("returns a deterministic mock ImageModel for mock / test api keys", async () => {
		const model = getImageModel(
			{
				kind: "openai-compatible",
				apiKey: "mock-provider-key",
			},
			"flux-schnell",
		);

		expect(model).toBeDefined();
		expect(typeof model).toBe("object");

		if (typeof model === "object" && "modelId" in model) {
			expect(model.modelId).toBe("flux-schnell");
		}

		if (
			typeof model === "object" &&
			"doGenerate" in model &&
			typeof model.doGenerate === "function"
		) {
			const res = await (
				model.doGenerate as unknown as (
					opts: unknown,
				) => Promise<{ images: string[] }>
			)({
				prompt: "A neon cyborg",
			});
			expect(res.images).toHaveLength(1);
			expect(res.images[0]).toBe(MOCK_PNG_BASE64);
		}
	});

	it("returns an ImageModel for valid-key fast path", () => {
		const model = getImageModel(
			{
				kind: "openai",
				apiKey: "valid-key",
			},
			"dall-e-3",
		);
		expect(model).toBeDefined();
		if (typeof model === "object" && "modelId" in model) {
			expect(model.modelId).toBe("dall-e-3");
		}
	});

	it("instantiates an OpenAI-compatible image model for real keys", () => {
		const model = getImageModel(
			{
				kind: "openai-compatible",
				apiKey: "sk-real-live-key",
				baseUrl: "https://api.together.xyz/v1",
			},
			"black-forest-labs/FLUX.1-schnell",
		);
		expect(model).toBeDefined();
		if (typeof model === "object" && "modelId" in model) {
			expect(model.modelId).toBe("black-forest-labs/FLUX.1-schnell");
		}
	});
});
