import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockJobAdapter } from "@/server/adapters/async-job";
import { decodeDataUrl, stubFetch } from "./job-adapter-test-utils";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("mock job adapter", () => {
	it("never calls the network for mock keys", async () => {
		const calls = stubFetch([]);
		const adapter = createMockJobAdapter({
			apiKey: "mock-provider-key",
			category: "video",
		});

		const handle = await adapter.submit({
			prompt: "a neon cyborg",
			modelId: "fal-ai/kling-video",
		});

		expect(handle.externalId).toMatch(/^mock-/);
		expect(calls).toHaveLength(0);

		const status = await adapter.status(handle);
		expect(status.state).toBe("succeeded");
		expect(status.progress).toBe(100);
		expect(status.outputUrl?.startsWith("data:video/mp4;base64,")).toBe(true);
		const mp4 = decodeDataUrl(status.outputUrl ?? "");
		expect(mp4.length).toBeGreaterThan(0);
		expect(new TextDecoder().decode(mp4.slice(4, 8))).toBe("ftyp");
	});

	it("returns a tiny wav data url for music jobs", async () => {
		stubFetch([]);
		const adapter = createMockJobAdapter({
			apiKey: "sk-test-provider-key",
			category: "music",
		});

		const handle = await adapter.submit({
			prompt: "a jingle",
			modelId: "owner/music-model",
		});
		const status = await adapter.status(handle);

		expect(status.outputUrl?.startsWith("data:audio/wav;base64,")).toBe(true);
		const bytes = decodeDataUrl(status.outputUrl ?? "");
		expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
		expect(bytes.length).toBeGreaterThan(44);
		const dataSize =
			bytes[40] | (bytes[41] << 8) | (bytes[42] << 16) | (bytes[43] << 24);
		expect(dataSize).toBe(bytes.length - 44);
	});
});
