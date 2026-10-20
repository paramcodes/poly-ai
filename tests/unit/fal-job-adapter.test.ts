import { afterEach, describe, expect, it, vi } from "vitest";
import { createFalJobAdapter } from "@/server/adapters/fal";
import { jsonResponse, stubFetch } from "./job-adapter-test-utils";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fal job adapter", () => {
	it("submits a fal job with the key auth header and prompt body", async () => {
		const calls = stubFetch([
			jsonResponse({
				request_id: "req-1",
				status: "IN_QUEUE",
				status_url: "https://fal.run/requests/req-1/status",
			}),
		]);
		const adapter = createFalJobAdapter({ apiKey: "test-key" });

		const handle = await adapter.submit({
			prompt: "a neon cyborg",
			modelId: "fal-ai/kling-video",
			params: { duration: 5 },
		});

		expect(handle).toEqual({
			externalId: "req-1",
			statusUrl: "https://fal.run/requests/req-1/status",
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://fal.run/fal-ai/kling-video");
		expect(calls[0].method).toBe("POST");
		expect(calls[0].headers.authorization).toBe("Key test-key");
		expect(calls[0].headers["content-type"]).toBe("application/json");
		expect(JSON.parse(calls[0].body ?? "{}")).toEqual({
			prompt: "a neon cyborg",
			duration: 5,
		});
	});

	it("maps IN_QUEUE to queued and IN_PROGRESS to running", async () => {
		const adapter = createFalJobAdapter({ apiKey: "test-key" });
		const handle = {
			externalId: "req-1",
			statusUrl: "https://fal.run/requests/req-1/status",
		};

		stubFetch([jsonResponse({ status: "IN_QUEUE" })]);
		expect(await adapter.status(handle)).toEqual({
			state: "queued",
			message: "Waiting in the fal queue",
		});

		stubFetch([jsonResponse({ status: "IN_PROGRESS" })]);
		expect(await adapter.status(handle)).toEqual({
			state: "running",
			progress: 50,
			message: "Rendering",
		});
	});

	it("returns the asset url of a completed fal job", async () => {
		const calls = stubFetch([
			jsonResponse({
				status: "COMPLETED",
				response_url: "https://fal.run/requests/req-1",
			}),
			jsonResponse({ video: { url: "https://cdn.fal.run/out.mp4" } }),
		]);
		const adapter = createFalJobAdapter({ apiKey: "test-key" });

		const status = await adapter.status({
			externalId: "req-1",
			statusUrl: "https://fal.run/requests/req-1/status",
		});

		expect(status).toEqual({
			state: "succeeded",
			progress: 100,
			outputUrl: "https://cdn.fal.run/out.mp4",
		});
		expect(calls[1].url).toBe("https://fal.run/requests/req-1");
		expect(calls[1].headers.authorization).toBe("Key test-key");
	});

	it("returns the asset url from a nested fal payload", async () => {
		stubFetch([
			jsonResponse({
				status: "COMPLETED",
				response_url: "https://fal.run/requests/req-2",
			}),
			jsonResponse({
				payload: { audio: { url: "https://cdn.fal.run/out.wav" } },
			}),
		]);
		const adapter = createFalJobAdapter({ apiKey: "test-key" });

		const status = await adapter.status({
			externalId: "req-2",
			statusUrl: "https://fal.run/requests/req-2/status",
		});

		expect(status.outputUrl).toBe("https://cdn.fal.run/out.wav");
	});

	it("returns a failed status when fal answers with an error", async () => {
		stubFetch([jsonResponse({ error: "model is cold" }, 500, "Server Error")]);
		const adapter = createFalJobAdapter({ apiKey: "test-key" });

		const status = await adapter.status({
			externalId: "req-1",
			statusUrl: "https://fal.run/requests/req-1/status",
		});

		expect(status).toEqual({ state: "failed", error: "model is cold" });
	});
});
