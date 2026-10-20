import { generateSpeech } from "ai";
import { describe, expect, it } from "vitest";
import { getSpeechModel } from "../../src/server/adapters/speech";

const MOCK_PROVIDER = {
	kind: "openai-compatible" as const,
	apiKey: "mock-provider-key",
};

describe("Speech adapter", () => {
	it("returns a mock speech model for mock / test api keys", async () => {
		const model = getSpeechModel(MOCK_PROVIDER, "tts-1");

		expect(model.specificationVersion).toBe("v2");
		expect(model.provider).toBe("mock.speech");
		expect(model.modelId).toBe("tts-1");

		const result = await model.doGenerate({ text: "Hello from Poly-AI" });

		expect(result.audio).toBeInstanceOf(Uint8Array);
		const audio = result.audio as Uint8Array;
		expect(audio.length).toBeGreaterThan(44);
		expect(new TextDecoder().decode(audio.slice(0, 4))).toBe("RIFF");
		expect(new TextDecoder().decode(audio.slice(8, 12))).toBe("WAVE");
		expect(result.warnings).toEqual([]);
		expect(result.response.modelId).toBe("tts-1");
	});

	it("treats valid-key and sk-test- keys as mock keys", () => {
		expect(
			getSpeechModel({ kind: "openai", apiKey: "valid-key" }, "tts-1").provider,
		).toBe("mock.speech");
		expect(
			getSpeechModel({ kind: "openai", apiKey: "sk-test-abc" }, "tts-1")
				.provider,
		).toBe("mock.speech");
	});

	it("returns a real speech model for real looking keys", () => {
		const model = getSpeechModel(
			{
				kind: "openai-compatible",
				apiKey: "sk-real-live-key",
				baseUrl: "https://api.together.xyz/v1",
			},
			"tts-1",
		);

		expect(model.provider).not.toBe("mock.speech");
		expect(model.provider).toBe("openai-compatible.speech");
		expect(model.modelId).toBe("tts-1");
	});

	it("synthesises speech through the AI SDK with the mock model", async () => {
		const result = await generateSpeech({
			model: getSpeechModel(MOCK_PROVIDER, "tts-1"),
			text: "Hello from Poly-AI",
		});

		expect(result.audio.uint8Array.length).toBeGreaterThan(44);
		expect(new TextDecoder().decode(result.audio.uint8Array.slice(0, 4))).toBe(
			"RIFF",
		);
	});
});
