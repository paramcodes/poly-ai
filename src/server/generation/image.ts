import { randomUUID } from "node:crypto";
import { generateImage } from "ai";
import { and, eq, or } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto/keys";
import { db } from "@/lib/db";
import { generations, models, providers } from "@/lib/db/schema";
import { formatSSEEvent, type GenerationEvent } from "@/lib/generation/events";
import { getImageModel } from "@/server/adapters";
import { getStorageAdapter, type StorageAdapter } from "@/server/storage";

export interface CreateImageGenerationOptions {
	userId: string;
	providerId: string;
	modelId: string;
	prompt: string;
	aspectRatio?: string;
	size?: `${number}x${number}`;
	model?: Parameters<typeof generateImage>[0]["model"];
	storage?: StorageAdapter;
}

/**
 * Orchestrates image generation:
 * 1. Validates provider & model assignment ownership.
 * 2. Decrypts API key and creates a queued row in generations table.
 * 3. Streams Server-Sent Events (queued -> running -> progress -> complete / error).
 * 4. Stores resulting asset via StorageAdapter and updates generations record.
 */
export async function createImageGenerationStream(
	options: CreateImageGenerationOptions,
): Promise<Response> {
	const { userId, providerId, modelId, prompt, aspectRatio, size } = options;

	// 1. Fetch provider record and verify ownership
	const [providerRecord] = await db
		.select()
		.from(providers)
		.where(and(eq(providers.id, providerId), eq(providers.userId, userId)));

	if (!providerRecord) {
		throw new Error("Provider not found");
	}

	// 2. Fetch model record and verify ownership
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

	// 3. Decrypt API key
	const apiKey = decryptApiKey(providerRecord.encryptedApiKey);

	// 4. Resolve ImageModel
	const actualModel =
		options.model ??
		getImageModel(
			{
				kind: providerRecord.kind,
				apiKey,
				baseUrl: providerRecord.baseUrl,
				name: providerRecord.name,
			},
			modelRecord.modelId,
		);

	// 5. Create generation record in 'queued' status
	const generationId = randomUUID();
	const metadata: Record<string, unknown> = {};
	if (aspectRatio) metadata.aspectRatio = aspectRatio;
	if (size) metadata.size = size;

	await db.insert(generations).values({
		id: generationId,
		userId,
		category: "image",
		providerId: providerRecord.id,
		modelId: modelRecord.modelId,
		prompt,
		status: "queued",
		metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
	});

	// 6. Setup SSE stream
	const storageAdapter = options.storage ?? getStorageAdapter();
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: GenerationEvent) => {
				controller.enqueue(encoder.encode(formatSSEEvent(event)));
			};

			try {
				// Emit queued event
				send({ type: "queued", generationId });

				// Transition row to running and emit progress
				await db
					.update(generations)
					.set({
						status: "running",
						updatedAt: new Date(),
					})
					.where(eq(generations.id, generationId));

				send({
					type: "progress",
					generationId,
					progress: 25,
					message: "Generating image...",
				});

				// Call generateImage
				const result = await generateImage({
					model: actualModel,
					prompt,
					...(aspectRatio
						? { aspectRatio: aspectRatio as `${number}:${number}` }
						: {}),
					...(size ? { size } : {}),
				});

				const image = result.image;
				if (!image) {
					throw new Error("No image was generated");
				}

				// Emit progress before storage upload
				send({
					type: "progress",
					generationId,
					progress: 75,
					message: "Uploading asset...",
				});

				// Upload image bytes to storage
				const body = image.uint8Array ?? Buffer.from(image.base64, "base64");
				const uploadResult = await storageAdapter.upload({
					pathname: `generations/${userId}/${generationId}.png`,
					body,
					contentType: "image/png",
				});

				// Transition row to succeeded with outputUrl
				await db
					.update(generations)
					.set({
						status: "succeeded",
						outputUrl: uploadResult.url,
						updatedAt: new Date(),
					})
					.where(eq(generations.id, generationId));

				// Emit complete event
				send({
					type: "complete",
					generationId,
					outputUrl: uploadResult.url,
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Image generation failed";

				try {
					await db
						.update(generations)
						.set({
							status: "failed",
							error: errorMessage,
							updatedAt: new Date(),
						})
						.where(eq(generations.id, generationId));
				} catch {
					// Swallow DB error so the SSE stream can complete with the error event
				}

				send({
					type: "error",
					generationId,
					error: errorMessage,
				});
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
