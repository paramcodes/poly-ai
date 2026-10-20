import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Provider adapter kinds from docs/glossary.md:
 * openai-compatible, openai, anthropic, google, fal, replicate, custom
 */
export const PROVIDER_KINDS = [
	"openai-compatible",
	"openai",
	"anthropic",
	"google",
	"fal",
	"replicate",
	"custom",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Provider status from docs/glossary.md:
 * active, invalid, disabled
 */
export const PROVIDER_STATUSES = ["active", "invalid", "disabled"] as const;

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

/**
 * Generation statuses from docs/glossary.md and ADR 0006:
 * queued, running, succeeded, failed, cancelled
 */
export const GENERATION_STATUSES = [
	"queued",
	"running",
	"succeeded",
	"failed",
	"cancelled",
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/**
 * Generation categories matching src/lib/categories.ts
 */
export const GENERATION_CATEGORIES = [
	"text",
	"image",
	"video",
	"music",
	"website",
] as const;

export type GenerationCategory = (typeof GENERATION_CATEGORIES)[number];

/**
 * providers table:
 * Stores user-configured provider credentials.
 * apiKey is an encrypted envelope string (v1.<iv>.<tag>.<ciphertext>).
 * apiKeyHint is the masked hint (e.g. ••••a1b2).
 */
export const providers = pgTable("providers", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	kind: text("kind").$type<ProviderKind>().notNull(),
	status: text("status").$type<ProviderStatus>().default("active").notNull(),
	baseUrl: text("base_url"),
	encryptedApiKey: text("encrypted_api_key").notNull(),
	apiKeyHint: text("api_key_hint").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

/**
 * models table:
 * User-assigned models exposed by a provider.
 * Capabilities are stored as jsonb array of strings (e.g. ["text", "reasoning"]).
 */
export const models = pgTable("models", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	providerId: text("provider_id")
		.notNull()
		.references(() => providers.id, { onDelete: "cascade" }),
	modelId: text("model_id").notNull(),
	name: text("name").notNull(),
	category: text("category").$type<GenerationCategory>().notNull(),
	capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
	enabled: text("enabled").default("true").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

/**
 * generations table:
 * Persistent record of every generation run (ADR 0006).
 */
export const generations = pgTable("generations", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	category: text("category").$type<GenerationCategory>().notNull(),
	providerId: text("provider_id").references(() => providers.id, {
		onDelete: "set null",
	}),
	modelId: text("model_id").notNull(),
	prompt: text("prompt").notNull(),
	status: text("status").$type<GenerationStatus>().default("queued").notNull(),
	providerExternalId: text("provider_external_id"),
	providerStatusUrl: text("provider_status_url"),
	outputUrl: text("output_url"),
	error: text("error"),
	metadata: jsonb("metadata").$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});
