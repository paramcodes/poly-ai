import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getStorageAdapter,
	MemoryStorageAdapter,
	setStorageAdapterForTesting,
	UpstashBlobStorageAdapter,
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

			await adapter.delete("generations/gen-1.png");
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
			expect(await adapter.getUrl("images/cat.jpg")).toBe(
				"https://custom.storage.local/media/images/cat.jpg",
			);
		});
	});

	describe("UpstashBlobStorageAdapter", () => {
		it("uploads through the bucket and returns its public url", async () => {
			const put = vi.fn().mockResolvedValue({
				path: "generations/gen-2.png",
				url: "https://store.upstash.io/generations/gen-2.png",
				size: 4,
				etag: "abc",
				uploadedAt: new Date(),
				contentType: "image/png",
			});
			const bucket = {
				put,
				del: vi.fn().mockResolvedValue(undefined),
				publicUrl: vi.fn().mockResolvedValue(undefined),
			};

			const adapter = new UpstashBlobStorageAdapter({
				bucket: bucket as never,
			});

			const result = await adapter.upload({
				pathname: "/generations/gen-2.png",
				body: Buffer.from("png!"),
				contentType: "image/png",
			});

			expect(result).toEqual({
				url: "https://store.upstash.io/generations/gen-2.png",
				pathname: "generations/gen-2.png",
			});
			expect(put).toHaveBeenCalledWith(
				"generations/gen-2.png",
				expect.any(Uint8Array),
				{ contentType: "image/png" },
			);
		});

		it("throws when the bucket is private and exposes no public url", async () => {
			const bucket = {
				put: vi.fn().mockResolvedValue({ path: "a.png" }),
				del: vi.fn(),
				publicUrl: vi.fn().mockResolvedValue(undefined),
			};

			const adapter = new UpstashBlobStorageAdapter({
				bucket: bucket as never,
			});

			await expect(
				adapter.upload({ pathname: "a.png", body: Buffer.from("x") }),
			).rejects.toThrow(/private/);
		});
	});

	describe("getStorageAdapter singleton resolution", () => {
		it("resolves to MemoryStorageAdapter without an Upstash token", () => {
			delete process.env.UPSTASH_BLOB_TOKEN;
			expect(getStorageAdapter()).toBeInstanceOf(MemoryStorageAdapter);
		});

		it("resolves to UpstashBlobStorageAdapter when the token is present", () => {
			process.env.UPSTASH_BLOB_TOKEN = "test-token";
			expect(getStorageAdapter()).toBeInstanceOf(UpstashBlobStorageAdapter);
		});
	});
});
