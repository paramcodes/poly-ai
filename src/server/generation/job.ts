import { randomUUID } from "node:crypto";
import { generateSpeech } from "ai";
import { and, eq, or } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto/keys";
import { db } from "@/lib/db";
import { generations, models, providers } from "@/lib/db/schema";
import {
	type AsyncJobHandle,
	getAsyncJobAdapter,
} from "@/server/adapters/async-job";
import { getSpeechModel } from "@/server/adapters/speech";
import { getStorageAdapter } from "@/server/storage";

export type GenerationRow = typeof generations.$inferSelect;
export type MediaCategory = "video" | "music";

export interface CreateMediaJobOptions {
	userId: string;
	providerId: string;
	modelId: string;
	category: MediaCategory;
	prompt: string;
	params?: Record<string, unknown>;
}

export interface CreateSpeechGenerationOptions {
	userId: string;
	providerId: string;
	modelId: string;
	text: string;
}

export interface GenerateMediaRequestBody {
	prompt: string;
	providerId: string;
	modelId: string;
	params?: Record<string, unknown>;
}

export interface GenerateMusicRequestBody extends GenerateMediaRequestBody {
	mode?: "song" | "voice";
}

export function isValidMediaGenerateRequestBody(
	body: unknown,
): body is GenerateMediaRequestBody {
	if (!body || typeof body !== "object") {
		return false;
	}
	const b = body as Record<string, unknown>;
	if (typeof b.prompt !== "string" || b.prompt.trim().length === 0) {
		return false;
	}
	if (typeof b.providerId !== "string" || b.providerId.trim().length === 0) {
		return false;
	}
	if (typeof b.modelId !== "string" || b.modelId.trim().length === 0) {
		return false;
	}
	if (
		b.params !== undefined &&
		(typeof b.params !== "object" ||
			b.params === null ||
			Array.isArray(b.params))
	) {
		return false;
	}
	return true;
}

export function isValidMusicGenerateRequestBody(
	body: unknown,
): body is GenerateMusicRequestBody {
	if (!isValidMediaGenerateRequestBody(body)) {
		return false;
	}
	const mode = (body as GenerateMusicRequestBody).mode;
	return mode === undefined || mode === "song" || mode === "voice";
}

async function loadOwnedProvider(userId: string, providerId: string) {
	const [providerRecord] = await db
		.select()
		.from(providers)
		.where(and(eq(providers.id, providerId), eq(providers.userId, userId)));

	if (!providerRecord) {
		throw new Error("Provider not found");
	}
	return providerRecord;
}

async function loadOwnedModel(
	userId: string,
	providerId: string,
	modelId: string,
) {
	const [modelRecord] = await db
		.select()
		.from(models)
		.where(
			and(
				eq(models.userId, userId),
				eq(models.providerId, providerId),
				or(eq(models.modelId, modelId), eq(models.id, modelId)),
			),
		);

	if (!modelRecord) {
		throw new Error("Model assignment not found");
	}
	if (modelRecord.enabled === "false") {
		throw new Error("Model assignment is disabled");
	}
	return modelRecord;
}

function readParams(metadata: Record<string, unknown> | null) {
	const params = metadata?.params;
	if (typeof params !== "object" || params === null || Array.isArray(params)) {
		return undefined;
	}
	return params as Record<string, unknown>;
}

/**
 * Submits an asynchronous media job (video or music) to the provider and
 * records it as a running generation. The provider job id is stored so the
 * job can be polled later through `refreshMediaJob`.
 */
export async function createMediaJob(
	options: CreateMediaJobOptions,
): Promise<GenerationRow> {
	const { userId, providerId, modelId, category, prompt, params } = options;

	const providerRecord = await loadOwnedProvider(userId, providerId);
	const modelRecord = await loadOwnedModel(userId, providerId, modelId);
	const apiKey = decryptApiKey(providerRecord.encryptedApiKey);

	const id = randomUUID();
	const metadata = params ? { params } : undefined;
	const createdAt = new Date();

	await db.insert(generations).values({
		id,
		userId,
		category,
		providerId: providerRecord.id,
		modelId: modelRecord.modelId,
		prompt,
		status: "queued",
		metadata,
	});

	const adapter = getAsyncJobAdapter(providerRecord.kind, {
		apiKey,
		baseUrl: providerRecord.baseUrl,
		category,
	});

	let handle: AsyncJobHandle;
	try {
		handle = await adapter.submit({
			prompt,
			modelId: modelRecord.modelId,
			params,
		});
	} catch (error) {
		// The row exists but no provider job does, so it must not sit in
		// `queued` for ever.
		await db
			.update(generations)
			.set({
				status: "failed",
				error:
					error instanceof Error
						? error.message
						: "The provider job could not be started",
				updatedAt: new Date(),
			})
			.where(eq(generations.id, id));
		throw error;
	}

	const updatedAt = new Date();
	await db
		.update(generations)
		.set({
			status: "running",
			providerExternalId: handle.externalId,
			providerStatusUrl: handle.statusUrl ?? null,
			updatedAt,
		})
		.where(eq(generations.id, id));

	return {
		id,
		userId,
		category,
		providerId: providerRecord.id,
		modelId: modelRecord.modelId,
		prompt,
		status: "running",
		providerExternalId: handle.externalId,
		providerStatusUrl: handle.statusUrl ?? null,
		outputUrl: null,
		error: null,
		metadata: metadata ?? null,
		createdAt,
		updatedAt,
	};
}

async function failRow(
	row: GenerationRow,
	message: string,
): Promise<GenerationRow> {
	const updatedAt = new Date();
	await db
		.update(generations)
		.set({ status: "failed", error: message, updatedAt })
		.where(eq(generations.id, row.id));
	return { ...row, status: "failed", error: message, updatedAt };
}

async function downloadAsset(
	url: string,
	category: MediaCategory,
): Promise<{ body: Uint8Array; contentType: string }> {
	const fallback = category === "video" ? "video/mp4" : "audio/mpeg";

	if (url.startsWith("data:")) {
		const commaIndex = url.indexOf(",");
		if (commaIndex < 0) {
			throw new Error("The provider returned a malformed data URL");
		}
		const header = url.slice("data:".length, commaIndex);
		const payload = url.slice(commaIndex + 1);
		const contentType = header.split(";")[0]?.trim() || fallback;
		const body = header.includes(";base64")
			? Buffer.from(payload, "base64")
			: Buffer.from(decodeURIComponent(payload));
		return { body, contentType };
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Asset download failed with status ${response.status}`);
	}
	const buffer = await response.arrayBuffer();
	const contentType =
		response.headers.get("content-type")?.split(";")[0]?.trim() || fallback;
	return { body: new Uint8Array(buffer), contentType };
}

/**
 * Polls the provider for a queued / running media job and stores the finished
 * asset. A row that is already finished is returned unchanged.
 */
export async function refreshMediaJob(
	userId: string,
	generationId: string,
): Promise<GenerationRow | null> {
	const [row] = await db
		.select()
		.from(generations)
		.where(
			and(eq(generations.id, generationId), eq(generations.userId, userId)),
		);

	if (!row) {
		return null;
	}
	if (row.status !== "queued" && row.status !== "running") {
		return row;
	}
	if (row.category !== "video" && row.category !== "music") {
		return row;
	}
	if (!row.providerExternalId) {
		return await failRow(row, "The provider job was never submitted");
	}

	const category: MediaCategory = row.category === "video" ? "video" : "music";

	try {
		const providerRecord = await loadOwnedProvider(
			userId,
			row.providerId ?? "",
		);
		const apiKey = decryptApiKey(providerRecord.encryptedApiKey);
		const adapter = getAsyncJobAdapter(providerRecord.kind, {
			apiKey,
			baseUrl: providerRecord.baseUrl,
			category,
		});
		const status = await adapter.status({
			externalId: row.providerExternalId,
			statusUrl: row.providerStatusUrl ?? undefined,
		});

		if (status.state === "succeeded") {
			if (!status.outputUrl) {
				return await failRow(
					row,
					"The provider job did not return an asset URL",
				);
			}
			const asset = await downloadAsset(status.outputUrl, category);
			const extension = category === "video" ? "mp4" : "mp3";
			const upload = await getStorageAdapter().upload({
				pathname: `generations/${userId}/${row.id}.${extension}`,
				body: asset.body,
				contentType: asset.contentType,
			});
			const updatedAt = new Date();
			await db
				.update(generations)
				.set({ status: "succeeded", outputUrl: upload.url, updatedAt })
				.where(eq(generations.id, row.id));
			return {
				...row,
				status: "succeeded",
				outputUrl: upload.url,
				error: null,
				updatedAt,
			};
		}

		if (status.state === "failed") {
			return await failRow(row, status.error ?? "The provider job failed");
		}

		return row;
	} catch (error) {
		return await failRow(
			row,
			error instanceof Error ? error.message : "The provider job failed",
		);
	}
}

/**
 * Starts a new job with the same provider, model, prompt and params as the
 * given generation.
 */
export async function retryMediaJob(
	userId: string,
	generationId: string,
): Promise<GenerationRow | null> {
	const [row] = await db
		.select()
		.from(generations)
		.where(
			and(eq(generations.id, generationId), eq(generations.userId, userId)),
		);

	if (!row) {
		return null;
	}
	if (row.category !== "video" && row.category !== "music") {
		throw new Error("Only video and music generations can be retried");
	}

	return await createMediaJob({
		userId,
		providerId: row.providerId ?? "",
		modelId: row.modelId,
		category: row.category,
		prompt: row.prompt,
		params: readParams(row.metadata),
	});
}

/**
 * Text to speech: renders the text with the provider's speech model and
 * stores the finished audio as a succeeded music generation.
 */
export async function createSpeechGeneration(
	options: CreateSpeechGenerationOptions,
): Promise<GenerationRow> {
	const { userId, providerId, modelId, text } = options;

	const providerRecord = await loadOwnedProvider(userId, providerId);
	const modelRecord = await loadOwnedModel(userId, providerId, modelId);
	const apiKey = decryptApiKey(providerRecord.encryptedApiKey);

	const result = await generateSpeech({
		model: getSpeechModel(
			{
				kind: providerRecord.kind,
				apiKey,
				baseUrl: providerRecord.baseUrl,
				name: providerRecord.name,
			},
			modelRecord.modelId,
		),
		text,
		outputFormat: "mp3",
	});

	const id = randomUUID();
	const upload = await getStorageAdapter().upload({
		pathname: `generations/${userId}/${id}.mp3`,
		body: result.audio.uint8Array,
		contentType: "audio/mpeg",
	});

	const createdAt = new Date();
	await db.insert(generations).values({
		id,
		userId,
		category: "music",
		providerId: providerRecord.id,
		modelId: modelRecord.modelId,
		prompt: text,
		status: "succeeded",
		outputUrl: upload.url,
	});

	return {
		id,
		userId,
		category: "music",
		providerId: providerRecord.id,
		modelId: modelRecord.modelId,
		prompt: text,
		status: "succeeded",
		providerExternalId: null,
		providerStatusUrl: null,
		outputUrl: upload.url,
		error: null,
		metadata: null,
		createdAt,
		updatedAt: createdAt,
	};
}
