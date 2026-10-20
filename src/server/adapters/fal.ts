import {
	type AsyncJobAdapter,
	type AsyncJobAdapterOptions,
	type AsyncJobHandle,
	type AsyncJobRequest,
	type AsyncJobStatus,
	asRecord,
	createMockJobAdapter,
	isMockApiKey,
	normalizeBaseUrl,
	readErrorMessage,
	readProviderError,
	readString,
} from "./async-job";

const DEFAULT_BASE_URL = "https://fal.run";
const TIMEOUT_MS = 15_000;

/**
 * fal is a queue: submit a request, poll its status, then fetch the result.
 */
export function createFalJobAdapter(
	options: AsyncJobAdapterOptions,
): AsyncJobAdapter {
	if (isMockApiKey(options.apiKey)) {
		return createMockJobAdapter(options);
	}

	const baseUrl = normalizeBaseUrl(options.baseUrl, DEFAULT_BASE_URL);
	const authHeaders = { Authorization: `Key ${options.apiKey}` };

	return {
		async submit(request: AsyncJobRequest): Promise<AsyncJobHandle> {
			const response = await fetch(`${baseUrl}/${request.modelId}`, {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: request.prompt,
					...(request.params ?? {}),
				}),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});

			if (!response.ok) {
				throw new Error(
					await readErrorMessage(
						response,
						`fal request failed with status ${response.status}`,
					),
				);
			}

			const payload: unknown = await response.json();
			const requestId = readString(asRecord(payload)?.request_id);
			if (!requestId) {
				throw new Error("fal did not return a request id");
			}
			return {
				externalId: requestId,
				statusUrl: readString(asRecord(payload)?.status_url),
			};
		},

		async status(handle: AsyncJobHandle): Promise<AsyncJobStatus> {
			if (!handle.statusUrl) {
				return {
					state: "failed",
					error: "The fal job has no status URL",
				};
			}

			const response = await fetch(handle.statusUrl, {
				method: "GET",
				headers: authHeaders,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});

			if (!response.ok) {
				return {
					state: "failed",
					error: await readErrorMessage(
						response,
						`fal status failed with status ${response.status}`,
					),
				};
			}

			const payload: unknown = await response.json();
			const status = readString(asRecord(payload)?.status) ?? "";

			if (status === "IN_QUEUE") {
				return { state: "queued", message: "Waiting in the fal queue" };
			}
			if (status === "IN_PROGRESS") {
				return { state: "running", progress: 50, message: "Rendering" };
			}
			if (status !== "COMPLETED") {
				return {
					state: "failed",
					error: readProviderError(
						payload,
						`fal job status ${status || "unknown"}`,
					),
				};
			}

			const responseUrl = readString(asRecord(payload)?.response_url);
			if (!responseUrl) {
				return {
					state: "failed",
					error: "The fal job completed without a response URL",
				};
			}

			const resultResponse = await fetch(responseUrl, {
				method: "GET",
				headers: authHeaders,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			if (!resultResponse.ok) {
				return {
					state: "failed",
					error: await readErrorMessage(
						resultResponse,
						`fal result failed with status ${resultResponse.status}`,
					),
				};
			}

			const result: unknown = await resultResponse.json();
			const outputUrl = pickFalAssetUrl(result);
			if (!outputUrl) {
				return {
					state: "failed",
					error: "The fal result did not contain an asset URL",
				};
			}
			return { state: "succeeded", progress: 100, outputUrl };
		},
	};
}

/** Accepted fal result shapes, in priority order. */
function pickFalAssetUrl(payload: unknown): string | undefined {
	const root = asRecord(payload);
	if (!root) {
		return undefined;
	}
	const inner = asRecord(root.payload);
	const images = Array.isArray(root.images) ? root.images : [];
	const innerImages = Array.isArray(inner?.images) ? inner.images : [];

	const candidates = [
		readString(asRecord(root.video)?.url),
		readString(asRecord(root.audio)?.url),
		readString(asRecord(images[0])?.url),
		readString(asRecord(root.output)?.url),
		readString(root.url),
		readString(asRecord(inner?.video)?.url),
		readString(asRecord(inner?.audio)?.url),
		readString(asRecord(innerImages[0])?.url),
	];

	return candidates.find((candidate) => candidate !== undefined);
}
