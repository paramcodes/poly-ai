/**
 * StorageAdapter interface and implementations for Poly-AI Phase 5.
 * See ADR-0009 (Vercel deployment and blob storage behind StorageAdapter).
 */
import { Bucket } from "@upstash/blob";

export interface StorageAdapter {
	upload(options: {
		pathname: string;
		body: Buffer | Uint8Array;
		contentType?: string;
	}): Promise<{ url: string; pathname: string }>;
	delete(pathname: string): Promise<void>;
	getUrl(pathname: string): Promise<string | undefined>;
}

export interface MemoryStorageAdapterOptions {
	baseUrl?: string;
	useDataUrls?: boolean;
}

export interface StoredMemoryItem {
	body: Buffer | Uint8Array;
	contentType?: string;
	url: string;
}

/**
 * Deterministic in-memory storage adapter for local development and test environments
 * without cloud credentials.
 */
export class MemoryStorageAdapter implements StorageAdapter {
	private readonly store = new Map<string, StoredMemoryItem>();
	private readonly baseUrl: string;
	private readonly useDataUrls: boolean;

	constructor(options?: MemoryStorageAdapterOptions) {
		this.baseUrl = (options?.baseUrl ?? "https://blob.memory.local").replace(
			/\/+$/,
			"",
		);
		this.useDataUrls = options?.useDataUrls ?? true;
	}

	async upload(options: {
		pathname: string;
		body: Buffer | Uint8Array;
		contentType?: string;
	}): Promise<{ url: string; pathname: string }> {
		const cleanPath = options.pathname.replace(/^\/+/, "");
		let url: string;

		if (this.useDataUrls) {
			const mime = options.contentType || "application/octet-stream";
			const base64 = Buffer.from(options.body).toString("base64");
			url = `data:${mime};base64,${base64}`;
		} else {
			url = `${this.baseUrl}/${cleanPath}`;
		}

		this.store.set(cleanPath, {
			body: options.body,
			contentType: options.contentType,
			url,
		});

		return {
			url,
			pathname: cleanPath,
		};
	}

	async delete(pathname: string): Promise<void> {
		this.store.delete(pathname.replace(/^\/+/, ""));
	}

	async getUrl(pathname: string): Promise<string | undefined> {
		if (
			pathname.startsWith("http://") ||
			pathname.startsWith("https://") ||
			pathname.startsWith("data:")
		) {
			return pathname;
		}
		const cleanPath = pathname.replace(/^\/+/, "");
		return this.store.get(cleanPath)?.url ?? `${this.baseUrl}/${cleanPath}`;
	}

	get(pathname: string): StoredMemoryItem | undefined {
		return this.store.get(pathname.replace(/^\/+/, ""));
	}

	has(pathname: string): boolean {
		return this.store.has(pathname.replace(/^\/+/, ""));
	}

	clear(): void {
		this.store.clear();
	}

	get size(): number {
		return this.store.size;
	}
}

export interface UpstashBlobStorageAdapterOptions {
	/** Pre-built bucket, for tests. */
	bucket?: Bucket;
	/** REST token. Defaults to `UPSTASH_BLOB_TOKEN`. */
	token?: string;
}

/**
 * Blob storage adapter backed by Upstash Blob.
 *
 * This is the only module that imports the Upstash Blob SDK, so swapping the
 * store for Cloudflare R2 is a change to this file alone (ADR-0009).
 */
export class UpstashBlobStorageAdapter implements StorageAdapter {
	private readonly bucket: Bucket | null;
	private readonly token: string;

	constructor(options?: UpstashBlobStorageAdapterOptions) {
		this.bucket = options?.bucket ?? null;
		this.token = options?.token ?? process.env.UPSTASH_BLOB_TOKEN ?? "";
	}

	/**
	 * Built on first use: the SDK validates the token format eagerly, and a
	 * malformed token should fail the upload, not the process start.
	 */
	private get client(): Bucket {
		if (this.bucket) {
			return this.bucket;
		}
		if (!this.token) {
			throw new Error(
				"UPSTASH_BLOB_TOKEN is required for UpstashBlobStorageAdapter",
			);
		}
		return new Bucket({ token: this.token });
	}

	async upload(options: {
		pathname: string;
		body: Buffer | Uint8Array;
		contentType?: string;
	}): Promise<{ url: string; pathname: string }> {
		const cleanPath = options.pathname.replace(/^\/+/, "");
		const blob = await this.client.put(
			cleanPath,
			new Uint8Array(options.body),
			options.contentType ? { contentType: options.contentType } : undefined,
		);

		const url = blob.url ?? (await this.client.publicUrl(cleanPath));
		if (!url) {
			throw new Error(
				`Upstash bucket is private; ${cleanPath} has no public URL. Use a public bucket or a signed URL.`,
			);
		}

		return { url, pathname: blob.path ?? cleanPath };
	}

	async delete(pathname: string): Promise<void> {
		await this.client.del(pathname.replace(/^\/+/, ""));
	}

	async getUrl(pathname: string): Promise<string | undefined> {
		return this.client.publicUrl(pathname.replace(/^\/+/, ""));
	}
}

let defaultAdapter: StorageAdapter | null = null;
let testingAdapter: StorageAdapter | null = null;

export function setStorageAdapterForTesting(
	adapter: StorageAdapter | null,
): void {
	testingAdapter = adapter;
	defaultAdapter = null;
}

export function getStorageAdapter(override?: StorageAdapter): StorageAdapter {
	if (override) {
		return override;
	}
	if (testingAdapter) {
		return testingAdapter;
	}
	if (!defaultAdapter) {
		const token = process.env.UPSTASH_BLOB_TOKEN?.trim();
		defaultAdapter = token
			? new UpstashBlobStorageAdapter({ token })
			: new MemoryStorageAdapter();
	}
	return defaultAdapter;
}
