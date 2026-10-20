import type { SpeechModel } from "ai";
import type { ProviderKind } from "@/lib/db/schema";

/** `ai@7` does not re-export `SpeechModelV2`; it is the v2 member of the `SpeechModel` union. */
export type SpeechModelV2 = Extract<
	SpeechModel,
	{ readonly specificationVersion: "v2" }
>;

export interface SpeechProviderOptions {
	kind: ProviderKind;
	apiKey: string;
	baseUrl?: string | null;
	name?: string;
}

const MOCK_SAMPLE_RATE = 8000;
const MOCK_SAMPLE_COUNT = 400;

/** 44-byte RIFF/WAVE header (PCM, mono, 8000 Hz, 16-bit) plus a few samples of silence. */
function createMockWav(): Uint8Array {
	const dataSize = MOCK_SAMPLE_COUNT * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);
	const writeAscii = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index++) {
			view.setUint8(offset + index, text.charCodeAt(index));
		}
	};

	writeAscii(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(8, "WAVE");
	writeAscii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, MOCK_SAMPLE_RATE, true);
	view.setUint32(28, MOCK_SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii(36, "data");
	view.setUint32(40, dataSize, true);

	return new Uint8Array(buffer);
}

function createMockSpeechModel(modelId: string): SpeechModelV2 {
	const audio = createMockWav();

	return {
		specificationVersion: "v2",
		provider: "mock.speech",
		modelId,
		async doGenerate() {
			return {
				audio,
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

/**
 * @ai-sdk/openai-compatible@2 ships no speech model, so the OpenAI-compatible
 * `/audio/speech` call is written by hand.
 */
function createOpenAICompatibleSpeechModel(options: {
	name: string;
	apiKey: string;
	baseUrl: string;
	modelId: string;
}): SpeechModelV2 {
	return {
		specificationVersion: "v2",
		provider: `${options.name}.speech`,
		modelId: options.modelId,
		async doGenerate(callOptions) {
			const response = await fetch(`${options.baseUrl}/audio/speech`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${options.apiKey}`,
					...(callOptions.headers ?? {}),
				},
				body: JSON.stringify({
					model: options.modelId,
					input: callOptions.text,
					voice: callOptions.voice ?? "alloy",
					response_format: callOptions.outputFormat ?? "mp3",
					speed: callOptions.speed,
					instructions: callOptions.instructions,
				}),
				signal: callOptions.abortSignal,
			});

			if (!response.ok) {
				throw new Error(
					`Speech provider request failed with status ${response.status}`,
				);
			}

			const headers: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				headers[key] = value;
			});

			return {
				audio: new Uint8Array(await response.arrayBuffer()),
				warnings: [],
				response: {
					timestamp: new Date(),
					modelId: options.modelId,
					headers,
				},
			};
		},
	};
}

/**
 * Returns a SpeechModel for the specified provider and model ID.
 * Uses a mock SpeechModel for local / test keys, otherwise an OpenAI-compatible speech endpoint.
 */
export function getSpeechModel(
	provider: SpeechProviderOptions,
	modelId: string,
): SpeechModelV2 {
	const { apiKey } = provider;

	if (
		apiKey.startsWith("mock-") ||
		apiKey.startsWith("sk-test-") ||
		apiKey === "valid-key"
	) {
		return createMockSpeechModel(modelId);
	}

	return createOpenAICompatibleSpeechModel({
		name: provider.name ?? provider.kind,
		apiKey,
		baseUrl: provider.baseUrl || "https://api.openai.com/v1",
		modelId,
	});
}
