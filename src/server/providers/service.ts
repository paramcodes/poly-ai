import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { evaluateCapabilityGating } from "@/lib/capabilities";
import type { Category as GenerationCategory } from "@/lib/categories";
import { decryptApiKey, encryptApiKey } from "@/lib/crypto/keys";
import { db } from "@/lib/db";
import {
	models,
	type ProviderKind,
	type ProviderStatus,
	providers,
} from "@/lib/db/schema";
import { probeProvider } from "@/lib/probe";

export interface CreateProviderInput {
	userId: string;
	name: string;
	kind: ProviderKind;
	apiKey: string;
	baseUrl?: string | null;
}

export interface UpdateProviderInput {
	name?: string;
	apiKey?: string;
	baseUrl?: string | null;
	status?: ProviderStatus;
}

export async function listUserProviders(userId: string) {
	return await db
		.select({
			id: providers.id,
			name: providers.name,
			kind: providers.kind,
			status: providers.status,
			baseUrl: providers.baseUrl,
			apiKeyHint: providers.apiKeyHint,
			createdAt: providers.createdAt,
			updatedAt: providers.updatedAt,
		})
		.from(providers)
		.where(eq(providers.userId, userId))
		.orderBy(providers.createdAt);
}

export async function createProvider(input: CreateProviderInput) {
	// 1. Probe the provider key
	const probe = await probeProvider({
		kind: input.kind,
		apiKey: input.apiKey,
		baseUrl: input.baseUrl,
	});

	const status: ProviderStatus = probe.ok ? "active" : "invalid";

	// 2. Encrypt the API key
	const { envelope, apiKeyHint } = encryptApiKey(input.apiKey);

	// 3. Store in DB
	const id = randomUUID();
	const [created] = await db
		.insert(providers)
		.values({
			id,
			userId: input.userId,
			name: input.name,
			kind: input.kind,
			status,
			baseUrl: input.baseUrl ?? null,
			encryptedApiKey: envelope,
			apiKeyHint,
		})
		.returning({
			id: providers.id,
			name: providers.name,
			kind: providers.kind,
			status: providers.status,
			baseUrl: providers.baseUrl,
			apiKeyHint: providers.apiKeyHint,
			createdAt: providers.createdAt,
		});

	return {
		provider: created,
		probe,
	};
}

export async function updateProvider(
	userId: string,
	providerId: string,
	input: UpdateProviderInput,
) {
	const valuesToUpdate: Partial<typeof providers.$inferInsert> = {};

	if (input.name) {
		valuesToUpdate.name = input.name;
	}
	if (input.baseUrl !== undefined) {
		valuesToUpdate.baseUrl = input.baseUrl;
	}
	if (input.status) {
		valuesToUpdate.status = input.status;
	}
	if (input.apiKey) {
		const { envelope, apiKeyHint } = encryptApiKey(input.apiKey);
		valuesToUpdate.encryptedApiKey = envelope;
		valuesToUpdate.apiKeyHint = apiKeyHint;
	}

	const [updated] = await db
		.update(providers)
		.set(valuesToUpdate)
		.where(and(eq(providers.id, providerId), eq(providers.userId, userId)))
		.returning({
			id: providers.id,
			name: providers.name,
			kind: providers.kind,
			status: providers.status,
			baseUrl: providers.baseUrl,
			apiKeyHint: providers.apiKeyHint,
			updatedAt: providers.updatedAt,
		});

	return updated;
}

export async function deleteProvider(userId: string, providerId: string) {
	await db
		.delete(providers)
		.where(and(eq(providers.id, providerId), eq(providers.userId, userId)));
}

export async function verifyProvider(userId: string, providerId: string) {
	const [record] = await db
		.select()
		.from(providers)
		.where(and(eq(providers.id, providerId), eq(providers.userId, userId)));

	if (!record) {
		throw new Error("Provider not found");
	}

	const plaintextKey = decryptApiKey(record.encryptedApiKey);

	const probe = await probeProvider({
		kind: record.kind,
		apiKey: plaintextKey,
		baseUrl: record.baseUrl,
	});

	const newStatus: ProviderStatus = probe.ok ? "active" : "invalid";
	await db
		.update(providers)
		.set({ status: newStatus })
		.where(eq(providers.id, providerId));

	return {
		probe,
		status: newStatus,
	};
}

// Model assignment operations
export interface AssignModelInput {
	userId: string;
	providerId: string;
	modelId: string;
	name: string;
	category: GenerationCategory;
	capabilities: string[]; // output modalities or features
	force?: boolean;
}

export async function listUserModels(
	userId: string,
	category?: GenerationCategory,
) {
	const conditions = [eq(models.userId, userId)];
	if (category) {
		conditions.push(eq(models.category, category));
	}

	return await db
		.select({
			id: models.id,
			providerId: models.providerId,
			providerName: providers.name,
			providerStatus: providers.status,
			modelId: models.modelId,
			name: models.name,
			category: models.category,
			capabilities: models.capabilities,
			enabled: models.enabled,
			createdAt: models.createdAt,
		})
		.from(models)
		.innerJoin(providers, eq(models.providerId, providers.id))
		.where(and(...conditions))
		.orderBy(models.category, models.name);
}

export async function assignModel(input: AssignModelInput) {
	const gating = evaluateCapabilityGating(input.capabilities, input.category);

	if (!gating.compatible && !input.force) {
		return {
			ok: false,
			gating,
			error: gating.warning,
		};
	}

	const id = randomUUID();
	const [created] = await db
		.insert(models)
		.values({
			id,
			userId: input.userId,
			providerId: input.providerId,
			modelId: input.modelId,
			name: input.name,
			category: input.category,
			capabilities: input.capabilities,
			enabled: "true",
		})
		.returning();

	return {
		ok: true,
		model: created,
		gating,
	};
}

export async function toggleModel(
	userId: string,
	modelId: string,
	enabled: boolean,
) {
	const [updated] = await db
		.update(models)
		.set({ enabled: enabled ? "true" : "false" })
		.where(and(eq(models.id, modelId), eq(models.userId, userId)))
		.returning();

	return updated;
}

export async function deleteModel(userId: string, modelId: string) {
	await db
		.delete(models)
		.where(and(eq(models.id, modelId), eq(models.userId, userId)));
}
