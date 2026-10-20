import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	convertToModelMessages,
	type ModelMessage,
	streamText,
	type UIMessage,
} from "ai";
import { and, eq, or } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto/keys";
import { db } from "@/lib/db";
import { type GenerationCategory, models, providers } from "@/lib/db/schema";

export const TEXT_SYSTEM_PROMPT =
	"You are a helpful, knowledgeable, and concise AI assistant.";

export const WEBSITE_SYSTEM_PROMPT = `You are an expert frontend developer and UI/UX designer.
Your task is to generate a single, complete, responsive, and modern self-contained HTML document based on the user's instructions.

Requirements:
1. Return ONLY the complete HTML document starting with <!DOCTYPE html> and ending with </html>.
2. The page must be fully self-contained. Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>) or clean embedded CSS within a <style> block in <head>.
3. Include any interactive JavaScript inside a <script> block before the closing </body> tag.
4. Ensure the design is beautiful, modern, accessible, and responsive across mobile, tablet, and desktop screens.
5. Do not use markdown wrappers, commentary, or external local assets. Use Unsplash URLs or SVG data URIs for images if needed.`;

export interface CreateStreamingGenerationOptions {
	userId: string;
	category: GenerationCategory | "text" | "website";
	providerId: string;
	modelId: string;
	messages: unknown[];
	system?: string;
	/** Optional model instance to override provider instantiation (e.g. for testing) */
	model?: Parameters<typeof streamText>[0]["model"];
}

function isUIMessageArray(msgs: unknown[]): msgs is UIMessage[] {
	return msgs.some(
		(m) =>
			typeof m === "object" &&
			m !== null &&
			"parts" in m &&
			Array.isArray(m.parts),
	);
}
export interface GenerateRequestBody {
	messages: unknown[];
	providerId: string;
	modelId: string;
}

export function isValidGenerateRequestBody(
	body: unknown,
): body is GenerateRequestBody {
	if (!body || typeof body !== "object") {
		return false;
	}
	if (
		!("messages" in body) ||
		!Array.isArray(body.messages) ||
		body.messages.length === 0
	) {
		return false;
	}
	if (
		!("providerId" in body) ||
		typeof body.providerId !== "string" ||
		body.providerId.trim().length === 0
	) {
		return false;
	}
	if (
		!("modelId" in body) ||
		typeof body.modelId !== "string" ||
		body.modelId.trim().length === 0
	) {
		return false;
	}
	return true;
}

export async function createStreamingGeneration(
	options: CreateStreamingGenerationOptions,
): Promise<Response> {
	const { userId, category, providerId, modelId, messages, system } = options;
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

	// 3. Decrypt API key on server
	const apiKey = decryptApiKey(providerRecord.encryptedApiKey);

	// 4. Instantiate @ai-sdk/openai-compatible client
	const providerClient = createOpenAICompatible({
		name: providerRecord.name,
		apiKey,
		baseURL: providerRecord.baseUrl || "https://api.openai.com/v1",
	});

	const actualModel = options.model ?? providerClient(modelRecord.modelId);

	// 5. Select category-specific system prompt
	const defaultSystemPrompt =
		category === "website" ? WEBSITE_SYSTEM_PROMPT : TEXT_SYSTEM_PROMPT;
	const activeSystemPrompt = system ?? defaultSystemPrompt;

	// 6. Normalize UI message format to model messages if needed
	const normalizedMessages: ModelMessage[] = isUIMessageArray(messages)
		? await convertToModelMessages(messages)
		: (messages as ModelMessage[]);

	// 7. Invoke streamText and return UI message stream response
	const result = streamText({
		model: actualModel,
		system: activeSystemPrompt,
		messages: normalizedMessages,
	});

	return result.toUIMessageStreamResponse();
}
