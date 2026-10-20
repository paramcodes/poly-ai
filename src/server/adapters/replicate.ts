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

const DEFAULT_BASE_URL = "https://api.replicate.com/v1";
const TIMEOUT_MS = 15_000;

/**
 * Replicate runs predictions asynchronously: submit, then poll the prediction
 * URL it hands back.
 */
export function createReplicateJobAdapter(
	options: AsyncJobAdapterOptions,
): AsyncJobAdapter {
	if (isMockApiKey(options.apiKey)) {
		return createMockJobAdapter(options);
	}

	const baseUrl = normalizeBaseUrl(options.baseUrl, DEFAULT_BASE_URL);
	const authHeaders = { Authorization: `Bearer ${options.apiKey}` };

	return {
		async submit(request: AsyncJobRequest): Promise<AsyncJobHandle> {
			const response = await fetch(
				`${baseUrl}/models/${request.modelId}/predictions`,
				{
					method: "POST",
					headers: { ...authHeaders, "Content-Type": "application/json" },
					body: JSON.stringify({
						input: {
							prompt: request.prompt,
							...(request.params ?? {}),
						},
					}),
					signal: AbortSignal.timeout(TIMEOUT_MS),
				},
			);

			if (!response.ok) {
				throw new Error(
					await readErrorMessage(
						response,
						`replicate request failed with status ${response.status}`,
					),
				);
			}

			const payload = asRecord(await response.json());
			const externalId = readString(payload?.id);
			if (!externalId) {
				throw new Error("replicate did not return a prediction id");
			}
			return {
				externalId,
				statusUrl: readString(asRecord(payload?.urls)?.get),
			};
		},

		async status(handle: AsyncJobHandle): Promise<AsyncJobStatus> {
			if (!handle.statusUrl) {
				return {
					state: "failed",
					error: "The replicate prediction has no status URL",
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
						`replicate status failed with status ${response.status}`,
					),
				};
			}

			const payload: unknown = await response.json();
			const status = readString(asRecord(payload)?.status) ?? "";

			if (status === "starting") {
				return { state: "queued" };
			}
			if (status === "processing") {
				return { state: "running", progress: 50 };
			}
			if (status === "succeeded") {
				const outputUrl = pickReplicateAssetUrl(asRecord(payload)?.output);
				if (!outputUrl) {
					return {
						state: "failed",
						error: "The replicate prediction did not contain an asset URL",
					};
				}
				return { state: "succeeded", progress: 100, outputUrl };
			}
			return {
				state: "failed",
				error: readProviderError(payload, status || "unknown"),
			};
		},
	};
}

/** `output` is a URL string, an array of URL strings, or a media object. */
function pickReplicateAssetUrl(output: unknown): string | undefined {
	const direct = readString(output);
	if (direct) {
		return direct;
	}
	if (Array.isArray(output)) {
		for (const item of output) {
			const url = readString(item);
			if (url) {
				return url;
			}
		}
		return undefined;
	}
	const root = asRecord(output);
	if (!root) {
		return undefined;
	}
	return (
		readString(root.url) ??
		readString(asRecord(root.video)?.url) ??
		readString(asRecord(root.audio)?.url)
	);
}
