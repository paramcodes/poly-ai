import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postMusic } from "@/app/api/generate/music/route";
import { POST as postSpeech } from "@/app/api/generate/speech/route";
import { POST as postVideo } from "@/app/api/generate/video/route";
import { POST as retryGeneration } from "@/app/api/generations/[id]/retry/route";
import { GET as getGenerationById } from "@/app/api/generations/[id]/route";
import { getCurrentUser } from "@/lib/session";
import {
	MemoryStorageAdapter,
	setStorageAdapterForTesting,
} from "@/server/storage";

const state = vi.hoisted(() => ({
	providers: [] as Record<string, unknown>[],
	models: [] as Record<string, unknown>[],
	generations: [] as Record<string, unknown>[],
	inserted: [] as Record<string, unknown>[],
	updates: [] as Record<string, unknown>[],
}));

const adapterMock = vi.hoisted(() => ({
	submit: vi.fn(),
	status: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/crypto/keys", () => ({
	decryptApiKey: vi.fn(() => "mock-secret-key"),
}));

vi.mock("@/server/adapters/async-job", () => ({
	getAsyncJobAdapter: vi.fn(() => adapterMock),
}));

vi.mock("@/lib/db", async () => {
	const { generations, models, providers } = await import("@/lib/db/schema");
	return {
		db: {
			select: vi.fn(() => ({
				from: vi.fn((table: unknown) => ({
					where: vi.fn(async () => {
						if (table === providers) return state.providers;
						if (table === models) return state.models;
						if (table === generations) return state.generations;
						return [];
					}),
				})),
			})),
			insert: vi.fn(() => ({
				values: vi.fn(async (values: Record<string, unknown>) => {
					state.inserted.push(values);
				}),
			})),
			update: vi.fn(() => ({
				set: vi.fn((values: Record<string, unknown>) => ({
					where: vi.fn(async () => {
						state.updates.push(values);
					}),
				})),
			})),
		},
	};
});

const provider = {
	id: "prov-1",
	userId: "user-1",
	name: "Fal",
	kind: "fal",
	status: "active",
	baseUrl: null,
	encryptedApiKey: "v1.iv.tag.ciphertext",
	apiKeyHint: "••••test",
	createdAt: new Date(),
	updatedAt: new Date(),
};

const model = {
	id: "mod-1",
	userId: "user-1",
	providerId: "prov-1",
	modelId: "kling-v1",
	name: "Kling",
	category: "video",
	capabilities: [],
	enabled: "true",
	createdAt: new Date(),
	updatedAt: new Date(),
};

function postReq(url: string, body?: unknown) {
	return new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

const videoEndpoint = "http://localhost/api/generate/video";
const musicEndpoint = "http://localhost/api/generate/music";
const speechEndpoint = "http://localhost/api/generate/speech";
const validPayload = {
	prompt: "a cat surfing",
	providerId: "prov-1",
	modelId: "kling-v1",
};

describe("media routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.providers = [provider];
		state.models = [model];
		state.generations = [];
		state.inserted = [];
		state.updates = [];
		setStorageAdapterForTesting(
			new MemoryStorageAdapter({ useDataUrls: false }),
		);
		adapterMock.submit.mockResolvedValue({
			externalId: "ext-123",
			statusUrl: "https://provider.test/status/ext-123",
		});
		adapterMock.status.mockResolvedValue({
			state: "succeeded",
			progress: 100,
			outputUrl: "data:video/mp4;base64,QUJD",
		});
		vi.mocked(getCurrentUser).mockResolvedValue({
			id: "user-1",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	describe("POST /api/generate/video", () => {
		it("returns 401 when the request is unauthenticated", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue(null);

			const res = await postVideo(postReq(videoEndpoint, validPayload));

			expect(res.status).toBe(401);
		});

		it("returns 400 when the prompt is missing", async () => {
			const res = await postVideo(
				postReq(videoEndpoint, { providerId: "prov-1", modelId: "kling-v1" }),
			);

			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe(
				"Invalid request: prompt, providerId, and modelId are required",
			);
		});

		it("returns 202 with the queued generation", async () => {
			const res = await postVideo(postReq(videoEndpoint, validPayload));

			expect(res.status).toBe(202);
			const json = await res.json();
			expect(json.generation.id).toBeDefined();
			expect(json.generation.status).toBe("running");
			expect(adapterMock.submit).toHaveBeenCalled();
		});

		it("returns 404 when the provider is not found", async () => {
			state.providers = [];

			const res = await postVideo(postReq(videoEndpoint, validPayload));

			expect(res.status).toBe(404);
			expect((await res.json()).error).toBe("Provider not found");
		});
	});

	describe("POST /api/generate/music", () => {
		it("returns 202 with a queued generation in song mode", async () => {
			const res = await postMusic(
				postReq(musicEndpoint, { ...validPayload, mode: "song" }),
			);

			expect(res.status).toBe(202);
			const json = await res.json();
			expect(json.generation.category).toBe("music");
			expect(json.generation.status).toBe("running");
		});

		it("returns a finished generation in voice mode without polling", async () => {
			const res = await postMusic(
				postReq(musicEndpoint, { ...validPayload, mode: "voice" }),
			);

			expect(res.status).toBe(202);
			const json = await res.json();
			expect(json.generation.status).toBe("succeeded");
			expect(json.generation.outputUrl).toContain(".mp3");
			expect(adapterMock.submit).not.toHaveBeenCalled();
			expect(adapterMock.status).not.toHaveBeenCalled();
		});
	});

	describe("POST /api/generate/speech", () => {
		it("returns 200 with a finished generation", async () => {
			const res = await postSpeech(
				postReq(speechEndpoint, {
					text: "hello there",
					providerId: "prov-1",
					modelId: "kling-v1",
				}),
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.generation.status).toBe("succeeded");
			expect(json.generation.prompt).toBe("hello there");
			expect(json.generation.outputUrl).toContain(".mp3");
		});
	});

	describe("GET /api/generations/[id]", () => {
		it("refreshes a running music generation", async () => {
			state.generations = [
				{
					id: "gen-1",
					userId: "user-1",
					category: "music",
					providerId: "prov-1",
					modelId: "kling-v1",
					prompt: "a cat surfing",
					status: "running",
					providerExternalId: "ext-1",
					providerStatusUrl: "https://provider.test/status/ext-1",
					outputUrl: null,
					error: null,
					metadata: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];
			adapterMock.status.mockResolvedValue({
				state: "succeeded",
				progress: 100,
				outputUrl: "data:audio/wav;base64,QUJD",
			});

			const res = await getGenerationById(
				{} as Parameters<typeof getGenerationById>[0],
				{ params: Promise.resolve({ id: "gen-1" }) },
			);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.generation.status).toBe("succeeded");
			expect(json.generation.outputUrl).toBe(
				"https://blob.memory.local/generations/user-1/gen-1.mp3",
			);
		});

		it("returns 404 for an unknown generation", async () => {
			const res = await getGenerationById(
				{} as Parameters<typeof getGenerationById>[0],
				{ params: Promise.resolve({ id: "missing" }) },
			);

			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/generations/[id]/retry", () => {
		it("returns 202 with the retried generation", async () => {
			state.generations = [
				{
					id: "gen-1",
					userId: "user-1",
					category: "video",
					providerId: "prov-1",
					modelId: "kling-v1",
					prompt: "a cat surfing",
					status: "failed",
					providerExternalId: "ext-1",
					providerStatusUrl: null,
					outputUrl: null,
					error: "the provider exploded",
					metadata: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const res = await retryGeneration(
				{} as Parameters<typeof retryGeneration>[0],
				{ params: Promise.resolve({ id: "gen-1" }) },
			);

			expect(res.status).toBe(202);
			const json = await res.json();
			expect(json.generation.id).not.toBe("gen-1");
			expect(json.generation.status).toBe("running");
		});

		it("returns 404 for an unknown generation", async () => {
			const res = await retryGeneration(
				{} as Parameters<typeof retryGeneration>[0],
				{ params: Promise.resolve({ id: "missing" }) },
			);

			expect(res.status).toBe(404);
		});
	});
});
