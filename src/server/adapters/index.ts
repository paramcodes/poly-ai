import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ImageModel } from "ai";
import type { ProviderKind } from "@/lib/db/schema";

export const MOCK_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export interface ImageModelProviderOptions {
	kind: ProviderKind;
	apiKey: string;
	baseUrl?: string | null;
	name?: string;
}

/**
 * Returns an ImageModel instance for the specified provider and model ID.
 * Uses a mock ImageModel for local / test keys, otherwise delegates to @ai-sdk/openai-compatible.
 */
export function getImageModel(
	provider: ImageModelProviderOptions,
	modelId: string,
): ImageModel {
	const { apiKey } = provider;

	if (
		apiKey.startsWith("mock-") ||
		apiKey.startsWith("sk-test-") ||
		apiKey === "valid-key"
	) {
		return {
			specificationVersion: "v2",
			provider: "mock.image",
			modelId,
			maxImagesPerCall: 1,
			async doGenerate() {
				return {
					images: [MOCK_PNG_BASE64],
					warnings: [],
					response: {
						timestamp: new Date(),
						modelId,
						headers: undefined,
					},
				};
			},
		};
	}

	const client = createOpenAICompatible({
		name: provider.name || provider.kind,
		apiKey: provider.apiKey,
		baseURL: provider.baseUrl || "https://api.openai.com/v1",
	});

	return client.imageModel(modelId);
}
