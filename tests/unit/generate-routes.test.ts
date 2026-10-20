import type * as AiModule from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postText } from "@/app/api/generate/text/route";
import { POST as postWebsite } from "@/app/api/generate/website/route";
import { decryptApiKey } from "@/lib/crypto/keys";
import { providers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import {
	createStreamingGeneration,
	TEXT_SYSTEM_PROMPT,
	WEBSITE_SYSTEM_PROMPT,
} from "@/server/generation/stream";

interface CapturedStreamArgs {
	system?: unknown;
	messages?: unknown[];
}

let capturedStreamArgs: CapturedStreamArgs | null = null;
let capturedProviderOpts: Record<string, unknown> | null = null;
let mockProvidersResult: unknown[] = [];
let mockModelsResult: unknown[] = [];

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof AiModule>();
	return {
		...actual,
		streamText: vi.fn((args: Parameters<typeof actual.streamText>[0]) => {
			capturedStreamArgs = args;
			return actual.streamText(args);
		}),
	};
});

function createMockModel(output = "Hello world") {
	return new MockLanguageModelV4({
		doStream: (async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "text-start", id: "1" },
					{ type: "text-delta", id: "1", delta: output },
					{ type: "text-end", id: "1" },
					{
						type: "finish" as const,
						finishReason: "stop" as const,
						usage: {
							inputTokens: {
								total: 10,
								noCache: 10,
								cacheRead: 0,
								cacheWrite: 0,
							},
							outputTokens: { total: 5, text: 5, reasoning: 0 },
						},
					},
				],
			}),
		})) as NonNullable<
			ConstructorParameters<typeof MockLanguageModelV4>[0]
		>["doStream"],
	});
}

const mockProvider = {
	id: "prov-123",
	userId: "user-456",
	name: "OpenAI",
	baseUrl: "https://api.openai.com/v1",
	encryptedApiKey: "v1.iv.tag.ciphertext",
};

const mockModel = {
	id: "mod-1",
	userId: "user-456",
	providerId: "prov-123",
	modelId: "gpt-4o",
	category: "text",
	enabled: "true",
};

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/crypto/keys", () => ({
	decryptApiKey: vi.fn(() => "super-secret-decrypted-api-key"),
}));
vi.mock("@ai-sdk/openai-compatible", () => ({
	createOpenAICompatible: vi.fn((opts: Record<string, unknown>) => {
		capturedProviderOpts = opts;
		return (_modelId: string) => createMockModel();
	}),
}));

vi.mock("@/lib/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn((table) => ({
				where: vi.fn(async () =>
					table === providers ? mockProvidersResult : mockModelsResult,
				),
			})),
		})),
	},
}));

function postReq(url: string, body?: unknown) {
	return new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

const textEndpoint = "http://localhost/api/generate/text";
const websiteEndpoint = "http://localhost/api/generate/website";
const validPayload = {
	messages: [{ role: "user", content: "Hello" }],
	providerId: "prov-123",
	modelId: "gpt-4o",
};

describe("POST /api/generate/text", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedProviderOpts = null;
		capturedStreamArgs = null;
		mockProvidersResult = [mockProvider];
		mockModelsResult = [mockModel];
		vi.mocked(getCurrentUser).mockResolvedValue({
			id: "user-456",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("returns 401 when request is unauthenticated", async () => {
		vi.mocked(getCurrentUser).mockResolvedValue(null);
		const res = await postText(postReq(textEndpoint, validPayload));
		expect(res.status).toBe(401);
		expect((await res.json()).error).toBe("Unauthorized");
	});

	it("returns 400 when request body is not valid JSON", async () => {
		const req = new Request(textEndpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "invalid{json",
		});
		const res = await postText(req);
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe("Invalid JSON body");
	});

	it("returns 400 when messages is missing or empty", async () => {
		const res1 = await postText(
			postReq(textEndpoint, { providerId: "prov-123", modelId: "gpt-4o" }),
		);
		expect(res1.status).toBe(400);

		const res2 = await postText(
			postReq(textEndpoint, { ...validPayload, messages: [] }),
		);
		expect(res2.status).toBe(400);
	});

	it("returns 400 when providerId is missing or empty", async () => {
		const res = await postText(
			postReq(textEndpoint, { ...validPayload, providerId: "  " }),
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when modelId is missing or empty", async () => {
		const res = await postText(
			postReq(textEndpoint, { ...validPayload, modelId: "" }),
		);
		expect(res.status).toBe(400);
	});

	it("returns 404 when provider is not found or not owned by user", async () => {
		mockProvidersResult = [];
		const res = await postText(postReq(textEndpoint, validPayload));
		expect(res.status).toBe(404);
		expect((await res.json()).error).toBe("Provider not found");
	});

	it("returns 404 when model assignment is not found", async () => {
		mockModelsResult = [];
		const res = await postText(postReq(textEndpoint, validPayload));
		expect(res.status).toBe(404);
		expect((await res.json()).error).toBe("Model assignment not found");
	});

	it("returns 403 when model assignment is disabled", async () => {
		mockModelsResult = [{ ...mockModel, enabled: "false" }];
		const res = await postText(postReq(textEndpoint, validPayload));
		expect(res.status).toBe(403);
		expect((await res.json()).error).toBe("Model assignment is disabled");
	});

	it("successfully streams response and never leaks API key in headers or body", async () => {
		const res = await postText(postReq(textEndpoint, validPayload));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");

		const headersJson = JSON.stringify(Array.from(res.headers.entries()));
		expect(headersJson).not.toContain("super-secret-decrypted-api-key");
		expect(headersJson).not.toContain("v1.iv.tag.ciphertext");

		const bodyText = await res.text();
		expect(bodyText).not.toContain("super-secret-decrypted-api-key");
		expect(bodyText).not.toContain("v1.iv.tag.ciphertext");
		expect(bodyText).toContain("Hello world");

		expect(decryptApiKey).toHaveBeenCalledWith("v1.iv.tag.ciphertext");
		expect(capturedProviderOpts?.apiKey).toBe("super-secret-decrypted-api-key");
		expect(capturedStreamArgs?.system).toBe(TEXT_SYSTEM_PROMPT);
	});
});

describe("POST /api/generate/website", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedProviderOpts = null;
		capturedStreamArgs = null;
		mockProvidersResult = [mockProvider];
		mockModelsResult = [{ ...mockModel, category: "website" }];
		vi.mocked(getCurrentUser).mockResolvedValue({
			id: "user-456",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("returns 401 when request is unauthenticated", async () => {
		vi.mocked(getCurrentUser).mockResolvedValue(null);
		const res = await postWebsite(postReq(websiteEndpoint, validPayload));
		expect(res.status).toBe(401);
		expect((await res.json()).error).toBe("Unauthorized");
	});

	it("returns 400 when required fields are missing", async () => {
		const res = await postWebsite(
			postReq(websiteEndpoint, { ...validPayload, messages: [] }),
		);
		expect(res.status).toBe(400);
	});

	it("successfully streams response using website system prompt and never leaks key", async () => {
		const res = await postWebsite(postReq(websiteEndpoint, validPayload));
		expect(res.status).toBe(200);

		const headersJson = JSON.stringify(Array.from(res.headers.entries()));
		expect(headersJson).not.toContain("super-secret-decrypted-api-key");

		const bodyText = await res.text();
		expect(bodyText).not.toContain("super-secret-decrypted-api-key");
		expect(bodyText).toContain("Hello world");

		expect(capturedStreamArgs?.system).toBe(WEBSITE_SYSTEM_PROMPT);
		expect(capturedStreamArgs?.system).toContain("<!DOCTYPE html>");
	});
});

describe("createStreamingGeneration helper", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedProviderOpts = null;
		capturedStreamArgs = null;
		mockProvidersResult = [mockProvider];
		mockModelsResult = [mockModel];
	});

	it("normalizes UI messages with parts into model messages", async () => {
		const mockModelInstance = createMockModel("UI Message result");
		const uiMessages = [
			{
				id: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Create a counter component" }],
			},
		];

		const response = await createStreamingGeneration({
			userId: "user-456",
			category: "text",
			providerId: "prov-123",
			modelId: "gpt-4o",
			messages: uiMessages,
			model: mockModelInstance,
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toContain("UI Message result");

		expect(capturedStreamArgs?.messages).toEqual([
			{
				role: "user",
				content: [{ type: "text", text: "Create a counter component" }],
			},
		]);
	});

	it("allows overriding the system prompt", async () => {
		const mockModelInstance = createMockModel("Custom prompt result");
		await createStreamingGeneration({
			userId: "user-456",
			category: "text",
			providerId: "prov-123",
			modelId: "gpt-4o",
			messages: [{ role: "user", content: "Hello" }],
			system: "Custom system prompt for testing",
			model: mockModelInstance,
		});

		expect(capturedStreamArgs?.system).toBe("Custom system prompt for testing");
	});
});
