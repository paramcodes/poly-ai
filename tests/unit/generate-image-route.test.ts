import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postImage } from "@/app/api/generate/image/route";
import { GET as getGenerationById } from "@/app/api/generations/[id]/route";
import { GET as getGenerations } from "@/app/api/generations/route";
import { parseSSEStream } from "@/lib/generation/events";
import { getCurrentUser } from "@/lib/session";

const mockProvider = {
	id: "prov-image",
	userId: "user-123",
	name: "Mock Provider",
	kind: "openai-compatible",
	baseUrl: "https://api.example.com",
	encryptedApiKey: "v1.iv.tag.ciphertext",
};

const mockModel = {
	id: "mod-image",
	userId: "user-123",
	providerId: "prov-image",
	modelId: "flux-schnell",
	category: "image",
	enabled: "true",
};

const mockGenerations = [
	{
		id: "gen-1",
		userId: "user-123",
		category: "image",
		providerId: "prov-image",
		modelId: "flux-schnell",
		prompt: "a cat in cyberpunk neon city",
		status: "succeeded",
		outputUrl: "data:image/png;base64,abc",
		createdAt: new Date(),
	},
];

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/crypto/keys", () => ({
	decryptApiKey: vi.fn(() => "mock-secret-key"),
}));

let insertedRow: Record<string, unknown> | null = null;

vi.mock("@/lib/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn((table) => {
				const tableName =
					table && typeof table === "object" && "_" in table
						? (table as { _: { name: string } })._.name
						: "";

				return {
					where: vi.fn((_cond) => {
						const result =
							tableName === "providers"
								? [mockProvider]
								: tableName === "models"
									? [mockModel]
									: mockGenerations;

						const promise = Promise.resolve(result);
						return Object.assign(promise, {
							orderBy: vi.fn(() => ({
								limit: vi.fn(async () => mockGenerations),
							})),
						});
					}),
				};
			}),
		})),
		insert: vi.fn(() => ({
			values: vi.fn((vals) => {
				insertedRow = vals;
				return Promise.resolve();
			}),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve()),
			})),
		})),
	},
}));

describe("POST /api/generate/image and GET /api/generations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertedRow = null;
		vi.mocked(getCurrentUser).mockResolvedValue({
			id: "user-123",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("returns 401 when request is unauthenticated", async () => {
		vi.mocked(getCurrentUser).mockResolvedValue(null);
		const req = new Request("http://localhost/api/generate/image", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: "A cat",
				providerId: "prov-image",
				modelId: "flux-schnell",
			}),
		});

		const res = await postImage(req);
		expect(res.status).toBe(401);
	});

	it("returns 400 for invalid body", async () => {
		const req = new Request("http://localhost/api/generate/image", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: "" }),
		});

		const res = await postImage(req);
		expect(res.status).toBe(400);
	});

	it("successfully runs image generation and streams SSE events to completion", async () => {
		const req = new Request("http://localhost/api/generate/image", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: "A neon dragon",
				providerId: "prov-image",
				modelId: "flux-schnell",
				aspectRatio: "1:1",
			}),
		});

		const res = await postImage(req);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");

		const events = [];
		if (res.body) {
			for await (const event of parseSSEStream(res.body)) {
				events.push(event);
			}
		}

		expect(events.length).toBeGreaterThanOrEqual(3);
		expect(events[0].type).toBe("queued");
		expect(events.some((e) => e.type === "progress")).toBe(true);
		expect(events[events.length - 1].type).toBe("complete");
		expect(insertedRow).toBeDefined();
		expect(insertedRow?.category).toBe("image");
	});

	it("returns generations list for GET /api/generations", async () => {
		const req = {
			nextUrl: new URL("http://localhost/api/generations?category=image"),
		} as Parameters<typeof getGenerations>[0];

		const res = await getGenerations(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.generations).toBeDefined();
		expect(json.generations).toHaveLength(1);
	});

	it("returns single generation for GET /api/generations/[id]", async () => {
		const req = {} as Parameters<typeof getGenerationById>[0];
		const res = await getGenerationById(req, {
			params: Promise.resolve({ id: "gen-1" }),
		});
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.generation.id).toBe("gen-1");
	});
});
