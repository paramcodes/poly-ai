import type { ProviderKind } from "@/lib/db/schema";

export type AsyncJobState = "queued" | "running" | "succeeded" | "failed";

export interface AsyncJobRequest {
	prompt: string;
	modelId: string;
	params?: Record<string, unknown>;
}

export interface AsyncJobHandle {
	/** The provider's own job id. */
	externalId: string;
	/** The provider's status endpoint, when it exposes one. */
	statusUrl?: string;
}

export interface AsyncJobStatus {
	state: AsyncJobState;
	/** 0–100, best effort. */
	progress?: number;
	message?: string;
	/** Where the finished asset lives, once the job succeeded. */
	outputUrl?: string;
	error?: string;
}

export interface AsyncJobAdapter {
	submit(request: AsyncJobRequest): Promise<AsyncJobHandle>;
	status(handle: AsyncJobHandle): Promise<AsyncJobStatus>;
}

export interface AsyncJobAdapterOptions {
	apiKey: string;
	baseUrl?: string | null;
	/** "video" | "music" — used to pick the mock placeholder asset. */
	category?: "video" | "music";
}

/** Local / test keys must never reach the network. */
export function isMockApiKey(apiKey: string): boolean {
	return (
		apiKey.startsWith("mock-") ||
		apiKey.startsWith("sk-test-") ||
		apiKey === "valid-key"
	);
}

/**
 * Offline adapter: submit hands back a fake job id, status reports a
 * finished job whose payload is a tiny real asset (so it can be uploaded).
 */
export function createMockJobAdapter(
	options: AsyncJobAdapterOptions,
): AsyncJobAdapter {
	const outputUrl =
		options.category === "video" ? MOCK_MP4_DATA_URL : MOCK_WAV_DATA_URL;

	return {
		async submit(): Promise<AsyncJobHandle> {
			return {
				externalId: `mock-${Math.random().toString(36).slice(2, 10)}`,
				statusUrl: undefined,
			};
		},
		async status(): Promise<AsyncJobStatus> {
			return { state: "succeeded", progress: 100, outputUrl };
		},
	};
}

export function normalizeBaseUrl(
	baseUrl: string | null | undefined,
	fallback: string,
): string {
	const trimmed = baseUrl?.trim();
	const value = trimmed && trimmed.length > 0 ? trimmed : fallback;
	return value.replace(/\/+$/, "");
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

export function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Provider errors arrive as a string, as `{ error: { message } }` or as `message`. */
export function readProviderError(payload: unknown, fallback: string): string {
	const root = asRecord(payload);
	const error = root?.error;
	const direct = readString(error);
	if (direct) {
		return direct;
	}
	const nested = readString(asRecord(error)?.message);
	if (nested) {
		return nested;
	}
	return readString(root?.message) ?? fallback;
}

/** Turns a non-2xx response into a message; never throws. */
export async function readErrorMessage(
	response: Response,
	fallback: string,
): Promise<string> {
	try {
		const payload: unknown = await response.json();
		return readProviderError(payload, fallback);
	} catch {
		return response.statusText || fallback;
	}
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

function ascii(text: string): Uint8Array {
	const bytes = new Uint8Array(text.length);
	for (let index = 0; index < text.length; index += 1) {
		bytes[index] = text.charCodeAt(index);
	}
	return bytes;
}

function uint32(value: number): Uint8Array {
	return new Uint8Array([
		(value >>> 24) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 8) & 0xff,
		value & 0xff,
	]);
}

/** RIFF headers are little-endian. */
function uint32le(value: number): Uint8Array {
	return new Uint8Array([
		value & 0xff,
		(value >>> 8) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 24) & 0xff,
	]);
}

function uint16le(value: number): Uint8Array {
	return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function mp4Box(type: string, ...payload: Uint8Array[]): Uint8Array {
	const body = concatBytes(payload);
	return concatBytes([uint32(body.length + 8), ascii(type), body]);
}

/** 1-frame MP4 skeleton: ftyp + moov(mvhd) + mdat. */
function buildTinyMp4(): Uint8Array {
	const unityMatrix = concatBytes([
		uint32(0x00010000),
		uint32(0),
		uint32(0),
		uint32(0),
		uint32(0x00010000),
		uint32(0),
		uint32(0),
		uint32(0),
		uint32(0x40000000),
	]);
	const mvhd = mp4Box(
		"mvhd",
		new Uint8Array([0, 0, 0, 0]),
		uint32(0),
		uint32(0),
		uint32(1000),
		uint32(0),
		uint32(0x00010000),
		new Uint8Array([0x01, 0x00]),
		new Uint8Array(2),
		new Uint8Array(8),
		unityMatrix,
		new Uint8Array(24),
		uint32(2),
	);
	return concatBytes([
		mp4Box(
			"ftyp",
			ascii("isom"),
			uint32(0x200),
			ascii("isom"),
			ascii("iso2"),
			ascii("mp41"),
		),
		mp4Box("moov", mvhd),
		mp4Box("mdat", new Uint8Array(16)),
	]);
}

/** 44-byte RIFF header plus a few samples of silence. */
function buildTinyWav(): Uint8Array {
	const sampleCount = 8;
	const dataSize = sampleCount * 2;
	const header = concatBytes([
		ascii("RIFF"),
		uint32le(36 + dataSize),
		ascii("WAVE"),
		ascii("fmt "),
		uint32le(16),
		uint16le(1),
		uint16le(1),
		uint32le(8000),
		uint32le(16000),
		uint16le(2),
		uint16le(16),
		ascii("data"),
		uint32le(dataSize),
	]);
	return concatBytes([header, new Uint8Array(dataSize)]);
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export const MOCK_MP4_DATA_URL = `data:video/mp4;base64,${toBase64(
	buildTinyMp4(),
)}`;

export const MOCK_WAV_DATA_URL = `data:audio/wav;base64,${toBase64(
	buildTinyWav(),
)}`;
