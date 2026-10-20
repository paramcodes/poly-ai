import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	modalitiesToCategories,
	type OutputModality,
} from "@/lib/capabilities";
import type { Category } from "@/lib/categories";

export interface NormalizedModel {
	id: string;
	name: string;
	description?: string;
	modalities: {
		input?: string[];
		output: OutputModality[];
	};
	categories: Category[];
	family?: string;
	status?: string;
	attachment?: boolean;
	reasoning?: boolean;
	toolCall?: boolean;
}

export interface NormalizedProvider {
	id: string;
	name: string;
	npm?: string;
	env: string[];
	api?: string;
	doc?: string;
	models: NormalizedModel[];
}

export interface CatalogueResponse {
	providers: NormalizedProvider[];
	updatedAt: string;
	source: "live" | "snapshot";
}

// In-process cache with 6 hours TTL
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let memoryCache: {
	data: CatalogueResponse;
	cachedAt: number;
} | null = null;

// Raw upstream models.dev shape
interface UpstreamModel {
	id: string;
	name?: string;
	description?: string;
	modalities?: {
		input?: string[];
		output?: string[];
	};
	family?: string;
	status?: string;
	attachment?: boolean;
	reasoning?: boolean;
	tool_call?: boolean;
}

interface UpstreamProvider {
	id: string;
	name?: string;
	npm?: string;
	env?: string[];
	api?: string;
	doc?: string;
	models?: Record<string, UpstreamModel>;
}

export function normalizeCatalogue(
	raw: Record<string, UpstreamProvider>,
	source: "live" | "snapshot",
): CatalogueResponse {
	const providers: NormalizedProvider[] = [];

	for (const [providerId, rawProvider] of Object.entries(raw)) {
		const rawModels = rawProvider.models || {};
		const models: NormalizedModel[] = [];

		for (const [modelId, rawModel] of Object.entries(rawModels)) {
			const outputModalities = rawModel.modalities?.output || ["text"];
			const categories = modalitiesToCategories(outputModalities);

			models.push({
				id: rawModel.id || modelId,
				name: rawModel.name || rawModel.id || modelId,
				description: rawModel.description,
				modalities: {
					input: rawModel.modalities?.input || [],
					output: outputModalities,
				},
				categories,
				family: rawModel.family,
				status: rawModel.status,
				attachment: rawModel.attachment,
				reasoning: rawModel.reasoning,
				toolCall: rawModel.tool_call,
			});
		}

		// Sort models alphabetically by name
		models.sort((a, b) => a.name.localeCompare(b.name));

		providers.push({
			id: rawProvider.id || providerId,
			name: rawProvider.name || rawProvider.id || providerId,
			npm: rawProvider.npm,
			env: rawProvider.env || [],
			api: rawProvider.api,
			doc: rawProvider.doc,
			models,
		});
	}

	// Sort providers alphabetically by name
	providers.sort((a, b) => a.name.localeCompare(b.name));

	return {
		providers,
		updatedAt: new Date().toISOString(),
		source,
	};
}

export function loadFallbackSnapshot(): CatalogueResponse {
	const snapshotPath = resolve(
		process.cwd(),
		"src/server/catalogue/models.dev.snapshot.json",
	);
	const rawText = readFileSync(snapshotPath, "utf-8");
	const parsed = JSON.parse(rawText) as Record<string, UpstreamProvider>;
	return normalizeCatalogue(parsed, "snapshot");
}

export async function getCatalogue(): Promise<CatalogueResponse> {
	const now = Date.now();
	if (memoryCache && now - memoryCache.cachedAt < SIX_HOURS_MS) {
		return memoryCache.data;
	}

	try {
		// Fetch with 5s timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		const res = await fetch("https://models.dev/api.json", {
			signal: controller.signal,
			headers: {
				"User-Agent": "poly-ai-catalogue",
			},
			next: {
				revalidate: 6 * 3600, // 6 hours
			},
		});
		clearTimeout(timeoutId);

		if (!res.ok) {
			throw new Error(`Upstream returned ${res.status}`);
		}

		const raw = (await res.json()) as Record<string, UpstreamProvider>;
		const normalized = normalizeCatalogue(raw, "live");
		memoryCache = {
			data: normalized,
			cachedAt: now,
		};
		return normalized;
	} catch (err) {
		console.warn(
			"Failed to fetch live catalogue from models.dev, falling back to committed snapshot:",
			err,
		);
		const fallback = loadFallbackSnapshot();
		memoryCache = {
			data: fallback,
			cachedAt: now,
		};
		return fallback;
	}
}
