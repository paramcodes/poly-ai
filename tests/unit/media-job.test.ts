import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createMediaJob,
	refreshMediaJob,
	retryMediaJob,
} from "@/server/generation/job";
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

function generation(overrides: Record<string, unknown> = {}) {
	return {
		id: "gen-1",
		userId: "user-1",
		category: "video",
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
		...overrides,
	};
}

describe("media job orchestration", () => {
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
	});

	it("inserts a queued row, submits to the provider and marks the row running", async () => {
		const row = await createMediaJob({
			userId: "user-1",
			providerId: "prov-1",
			modelId: "kling-v1",
			category: "video",
			prompt: "a cat surfing",
		});

		expect(state.inserted).toHaveLength(1);
		expect(state.inserted[0]).toMatchObject({
			userId: "user-1",
			category: "video",
			providerId: "prov-1",
			modelId: "kling-v1",
			prompt: "a cat surfing",
			status: "queued",
		});
		expect(adapterMock.submit).toHaveBeenCalledWith({
			prompt: "a cat surfing",
			modelId: "kling-v1",
			params: undefined,
		});
		expect(state.updates[0]).toMatchObject({
			status: "running",
			providerExternalId: "ext-123",
			providerStatusUrl: "https://provider.test/status/ext-123",
		});
		expect(row.status).toBe("running");
		expect(row.providerExternalId).toBe("ext-123");
	});

	it("stores the job params in the metadata column", async () => {
		await createMediaJob({
			userId: "user-1",
			providerId: "prov-1",
			modelId: "kling-v1",
			category: "video",
			prompt: "a cat surfing",
			params: { duration: 5 },
		});

		expect(state.inserted[0]?.metadata).toEqual({ params: { duration: 5 } });
	});

	it("rejects a provider owned by another user", async () => {
		state.providers = [];

		await expect(
			createMediaJob({
				userId: "user-1",
				providerId: "prov-1",
				modelId: "kling-v1",
				category: "video",
				prompt: "a cat surfing",
			}),
		).rejects.toThrow("Provider not found");
	});

	it("rejects an unknown model assignment", async () => {
		state.models = [];

		await expect(
			createMediaJob({
				userId: "user-1",
				providerId: "prov-1",
				modelId: "kling-v1",
				category: "video",
				prompt: "a cat surfing",
			}),
		).rejects.toThrow("Model assignment not found");
	});

	it("rejects a disabled model assignment", async () => {
		state.models = [{ ...model, enabled: "false" }];

		await expect(
			createMediaJob({
				userId: "user-1",
				providerId: "prov-1",
				modelId: "kling-v1",
				category: "video",
				prompt: "a cat surfing",
			}),
		).rejects.toThrow("Model assignment is disabled");
	});

	it("uploads the finished asset and succeeds the row", async () => {
		state.generations = [generation()];

		const row = await refreshMediaJob("user-1", "gen-1");

		expect(row?.status).toBe("succeeded");
		expect(row?.outputUrl).toBe(
			"https://blob.memory.local/generations/user-1/gen-1.mp4",
		);
		expect(state.updates[0]).toMatchObject({
			status: "succeeded",
			outputUrl: "https://blob.memory.local/generations/user-1/gen-1.mp4",
		});
	});

	it("fails the row with the provider error message", async () => {
		state.generations = [generation()];
		adapterMock.status.mockResolvedValue({
			state: "failed",
			error: "the provider exploded",
		});

		const row = await refreshMediaJob("user-1", "gen-1");

		expect(row?.status).toBe("failed");
		expect(row?.error).toBe("the provider exploded");
		expect(state.updates[0]).toMatchObject({
			status: "failed",
			error: "the provider exploded",
		});
	});

	it("fails the row when the provider job was never submitted", async () => {
		state.generations = [generation({ providerExternalId: null })];

		const row = await refreshMediaJob("user-1", "gen-1");

		expect(row?.status).toBe("failed");
		expect(row?.error).toBe("The provider job was never submitted");
	});

	it("leaves a running row running", async () => {
		state.generations = [generation()];
		adapterMock.status.mockResolvedValue({ state: "running", progress: 50 });

		const row = await refreshMediaJob("user-1", "gen-1");

		expect(row?.status).toBe("running");
		expect(row?.outputUrl).toBeNull();
		expect(state.updates).toHaveLength(0);
	});

	it("returns null for a generation that does not exist", async () => {
		expect(await refreshMediaJob("user-1", "missing")).toBeNull();
	});

	it("retries a job with the same prompt, model and params", async () => {
		state.generations = [
			generation({
				status: "failed",
				error: "the provider exploded",
				metadata: { params: { duration: 5 } },
			}),
		];

		const row = await retryMediaJob("user-1", "gen-1");

		expect(row?.id).not.toBe("gen-1");
		expect(state.inserted[0]).toMatchObject({
			prompt: "a cat surfing",
			modelId: "kling-v1",
			category: "video",
			status: "queued",
			metadata: { params: { duration: 5 } },
		});
		expect(adapterMock.submit).toHaveBeenCalledWith({
			prompt: "a cat surfing",
			modelId: "kling-v1",
			params: { duration: 5 },
		});
	});
});
