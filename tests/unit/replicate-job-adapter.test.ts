import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type AsyncJobAdapter,
	getAsyncJobAdapter,
} from "@/server/adapters/async-job";
import { createReplicateJobAdapter } from "@/server/adapters/replicate";
import { jsonResponse, stubFetch } from "./job-adapter-test-utils";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("replicate job adapter", () => {
	it("submits a replicate prediction with the bearer token and input body", async () => {
		const calls = stubFetch([
			jsonResponse({
				id: "pred-1",
				status: "starting",
				urls: { get: "https://api.replicate.com/v1/predictions/pred-1" },
			}),
		]);
		const adapter = createReplicateJobAdapter({ apiKey: "test-key" });

		const handle = await adapter.submit({
			prompt: "a neon cyborg",
			modelId: "owner/video-model",
			params: { num_frames: 12 },
		});

		expect(handle).toEqual({
			externalId: "pred-1",
			statusUrl: "https://api.replicate.com/v1/predictions/pred-1",
		});
		expect(calls[0].url).toBe(
			"https://api.replicate.com/v1/models/owner/video-model/predictions",
		);
		expect(calls[0].method).toBe("POST");
		expect(calls[0].headers.authorization).toBe("Bearer test-key");
		expect(calls[0].headers["content-type"]).toBe("application/json");
		expect(JSON.parse(calls[0].body ?? "{}")).toEqual({
			input: { prompt: "a neon cyborg", num_frames: 12 },
		});
	});

	it("maps starting to queued and processing to running", async () => {
		const adapter = createReplicateJobAdapter({ apiKey: "test-key" });
		const handle = {
			externalId: "pred-1",
			statusUrl: "https://api.replicate.com/v1/predictions/pred-1",
		};

		stubFetch([jsonResponse({ status: "starting" })]);
		expect(await adapter.status(handle)).toEqual({ state: "queued" });

		stubFetch([jsonResponse({ status: "processing" })]);
		expect(await adapter.status(handle)).toEqual({
			state: "running",
			progress: 50,
		});
	});

	it("returns the asset url of a succeeded replicate prediction", async () => {
		const adapter = createReplicateJobAdapter({ apiKey: "test-key" });
		const handle = {
			externalId: "pred-1",
			statusUrl: "https://api.replicate.com/v1/predictions/pred-1",
		};

		stubFetch([
			jsonResponse({
				status: "succeeded",
				output: "https://replicate.delivery/out.mp4",
			}),
		]);
		expect(await adapter.status(handle)).toEqual({
			state: "succeeded",
			progress: 100,
			outputUrl: "https://replicate.delivery/out.mp4",
		});

		stubFetch([
			jsonResponse({
				status: "succeeded",
				output: ["https://replicate.delivery/out.mp4"],
			}),
		]);
		expect(await adapter.status(handle)).toEqual({
			state: "succeeded",
			progress: 100,
			outputUrl: "https://replicate.delivery/out.mp4",
		});
	});

	it("returns a failed status when replicate reports a failure", async () => {
		stubFetch([
			jsonResponse({ status: "failed", error: "Out of memory" }, 500),
		]);
		const adapter = createReplicateJobAdapter({ apiKey: "test-key" });

		const status = await adapter.status({
			externalId: "pred-1",
			statusUrl: "https://api.replicate.com/v1/predictions/pred-1",
		});

		expect(status).toEqual({ state: "failed", error: "Out of memory" });
	});
});

describe("getAsyncJobAdapter", () => {
	it("returns the fal adapter for the fal kind", async () => {
		const calls = stubFetch([jsonResponse({ request_id: "req-1" })]);
		const adapter: AsyncJobAdapter = getAsyncJobAdapter("fal", {
			apiKey: "test-key",
		});

		await adapter.submit({ prompt: "hello", modelId: "fal-ai/kling-video" });

		expect(calls[0].url).toBe("https://fal.run/fal-ai/kling-video");
		expect(calls[0].headers.authorization).toBe("Key test-key");
	});

	it("returns the replicate adapter for the replicate kind", async () => {
		const calls = stubFetch([jsonResponse({ id: "pred-1" })]);
		const adapter: AsyncJobAdapter = getAsyncJobAdapter("replicate", {
			apiKey: "test-key",
		});

		await adapter.submit({ prompt: "hello", modelId: "owner/video-model" });

		expect(calls[0].url).toBe(
			"https://api.replicate.com/v1/models/owner/video-model/predictions",
		);
		expect(calls[0].headers.authorization).toBe("Bearer test-key");
	});

	it("throws for a provider kind without an async job adapter", () => {
		expect(() =>
			getAsyncJobAdapter("openai-compatible", { apiKey: "test-key" }),
		).toThrow("No async job adapter for provider kind: openai-compatible");
	});
});
