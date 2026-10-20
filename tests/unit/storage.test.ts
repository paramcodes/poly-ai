import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	BlobStorageAdapter,
	getStorageAdapter,
	MemoryStorageAdapter,
	setStorageAdapterForTesting,
} from "../../src/server/storage";

describe("StorageAdapter implementations", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		setStorageAdapterForTesting(null);
		vi.restoreAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		setStorageAdapterForTesting(null);
		vi.restoreAllMocks();
	});

	describe("MemoryStorageAdapter", () => {
		it("uploads bytes and returns data URL by default", async () => {
			const adapter = new MemoryStorageAdapter();
			const buffer = Buffer.from("fake-png-data");

			const result = await adapter.upload({
				pathname: "generations/gen-1.png",
				body: buffer,
				contentType: "image/png",
			});

			expect(result.pathname).toBe("generations/gen-1.png");
			expect(result.url).toBe(
				`data:image/png;base64,${buffer.toString("base64")}`,
			);
			expect(adapter.has("generations/gen-1.png")).toBe(true);

			await adapter.delete(result.url);
			expect(adapter.has("generations/gen-1.png")).toBe(false);
		});

		it("generates mock URLs when useDataUrls is false", async () => {
			const adapter = new MemoryStorageAdapter({
				baseUrl: "https://custom.storage.local/media",
				useDataUrls: false,
			});

			const result = await adapter.upload({
				pathname: "images/cat.jpg",
				body: Buffer.from("jpg"),
			});

			expect(result.url).toBe(
				"https://custom.storage.local/media/images/cat.jpg",
			);
			expect(adapter.getUrl("images/cat.jpg")).toBe(
				"https://custom.storage.local/media/images/cat.jpg",
			);
		});
	});

	describe("BlobStorageAdapter", () => {
		it("uploads using bearer token when BLOB_READ_WRITE_TOKEN is set", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					url: "https://blob.vercel-storage.com/image-123.png",
					pathname: "images/image-123.png",
				}),
			});

			const adapter = new BlobStorageAdapter({
				token: "vercel_blob_rw_test_token_123",
				fetch: mockFetch as unknown as typeof fetch,
			});

			const result = await adapter.upload({
				pathname: "images/image-123.png",
				body: Buffer.from("bytes"),
				contentType: "image/png",
			});

			expect(result.url).toBe("https://blob.vercel-storage.com/image-123.png");
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("image-123.png"),
				expect.objectContaining({
					method: "PUT",
					headers: expect.objectContaining({
						Authorization: "Bearer vercel_blob_rw_test_token_123",
					}),
				}),
			);
		});
	});

	describe("getStorageAdapter singleton resolution", () => {
		it("resolves to MemoryStorageAdapter in absence of BLOB_READ_WRITE_TOKEN", () => {
			delete process.env.BLOB_READ_WRITE_TOKEN;
			const adapter = getStorageAdapter();
			expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
		});

		it("resolves to BlobStorageAdapter when token is present", () => {
			process.env.BLOB_READ_WRITE_TOKEN = "test-token";
			const adapter = getStorageAdapter();
			expect(adapter).toBeInstanceOf(BlobStorageAdapter);
		});
	});
});
