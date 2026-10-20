/**
 * StorageAdapter interface and implementations for Poly-AI Phase 5.
 * See ADR-0009 (Vercel deployment and blob storage behind StorageAdapter).
 */

export interface StorageAdapter {
	upload(options: {
		pathname: string;
		body: Buffer | Uint8Array;
		contentType?: string;
	}): Promise<{ url: string; pathname: string }>;
	delete(url: string): Promise<void>;
	getUrl(pathname: string): string;
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

	async delete(urlOrPathname: string): Promise<void> {
		const cleanPath = urlOrPathname.replace(/^\/+/, "");
		if (this.store.has(cleanPath)) {
			this.store.delete(cleanPath);
			return;
		}

		// Also match by stored URL or constructed base URL
		for (const [key, value] of this.store.entries()) {
			if (
				value.url === urlOrPathname ||
				`${this.baseUrl}/${key}` === urlOrPathname
			) {
				this.store.delete(key);
				return;
			}
		}
	}

	getUrl(pathname: string): string {
		if (
			pathname.startsWith("http://") ||
			pathname.startsWith("https://") ||
			pathname.startsWith("data:")
		) {
			return pathname;
		}
		const cleanPath = pathname.replace(/^\/+/, "");
		const existing = this.store.get(cleanPath);
		if (existing) {
			return existing.url;
		}
		return `${this.baseUrl}/${cleanPath}`;
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

export interface BlobStorageAdapterOptions {
	token?: string;
	apiBaseUrl?: string;
	fetch?: typeof fetch;
}

/**
 * Remote blob storage adapter communicating via HTTP with Vercel Blob / Upstash Blob.
 */
export class BlobStorageAdapter implements StorageAdapter {
	private readonly token: string;
	private readonly apiBaseUrl: string;
	private readonly customFetch: typeof fetch;

	constructor(options?: BlobStorageAdapterOptions) {
		const token = options?.token ?? process.env.BLOB_READ_WRITE_TOKEN;
		if (!token || token.trim().length === 0) {
			throw new Error(
				"BLOB_READ_WRITE_TOKEN is required for BlobStorageAdapter",
			);
		}
		this.token = token.trim();
		this.customFetch = options?.fetch ?? fetch;
		this.apiBaseUrl = (
			options?.apiBaseUrl ??
			process.env.BLOB_API_URL ??
			"https://blob.vercel-storage.com"
		).replace(/\/+$/, "");
	}

	async upload(options: {
		pathname: string;
		body: Buffer | Uint8Array;
		contentType?: string;
	}): Promise<{ url: string; pathname: string }> {
		const cleanPath = options.pathname.replace(/^\/+/, "");
		const targetUrl = `${this.apiBaseUrl}/${cleanPath}`;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.token}`,
			"x-api-version": "7",
		};
		if (options.contentType) {
			headers["Content-Type"] = options.contentType;
		}

		const response = await this.customFetch(targetUrl, {
			method: "PUT",
			headers,
			body: options.body as unknown as BodyInit,
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`Blob storage upload failed (${response.status}): ${errText || response.statusText}`,
			);
		}

		const data = (await response.json()) as { url?: string; pathname?: string };
		return {
			url: data.url ?? targetUrl,
			pathname: data.pathname ?? cleanPath,
		};
	}

	async delete(urlOrPathname: string): Promise<void> {
		const targetUrl = `${this.apiBaseUrl}/delete`;
		const fullUrl =
			urlOrPathname.startsWith("http://") ||
			urlOrPathname.startsWith("https://")
				? urlOrPathname
				: this.getUrl(urlOrPathname);

		const response = await this.customFetch(targetUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ urls: [fullUrl] }),
		});

		if (!response.ok && response.status !== 404) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`Blob storage delete failed (${response.status}): ${errText || response.statusText}`,
			);
		}
	}

	getUrl(pathname: string): string {
		if (
			pathname.startsWith("http://") ||
			pathname.startsWith("https://") ||
			pathname.startsWith("data:")
		) {
			return pathname;
		}
		const cleanPath = pathname.replace(/^\/+/, "");
		return `${this.apiBaseUrl}/${cleanPath}`;
	}
}

/** Alias for UpstashBlobStorageAdapter as referenced in architectural documents */
export { BlobStorageAdapter as UpstashBlobStorageAdapter };

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
		const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
		if (token) {
			defaultAdapter = new BlobStorageAdapter({ token });
		} else {
			defaultAdapter = new MemoryStorageAdapter();
		}
	}
	return defaultAdapter;
}
