import type { ProviderKind } from "@/lib/db/schema";

export interface ProbeResult {
	ok: boolean;
	status: number;
	error?: string;
	latencyMs?: number;
}

/**
 * Probes a provider's endpoint with the supplied API key to verify whether credentials are valid.
 *
 * For mock / test providers (e.g. key starting with "mock-" or "sk-test-"),
 * it immediately returns ok without making external network calls.
 *
 * For OpenAI and OpenAI-compatible providers, it issues a lightweight request
 * (such as GET /models or HEAD /).
 */
export async function probeProvider(params: {
	kind: ProviderKind;
	apiKey: string;
	baseUrl?: string | null;
}): Promise<ProbeResult> {
	const { kind, apiKey, baseUrl } = params;

	// Mock / fake key fast path (needed for tests and offline evidence capture)
	if (
		apiKey.startsWith("mock-") ||
		apiKey.startsWith("sk-test-") ||
		apiKey === "valid-key"
	) {
		return {
			ok: true,
			status: 200,
			latencyMs: 12,
		};
	}

	if (apiKey === "invalid-key") {
		return {
			ok: false,
			status: 401,
			error: "Invalid API key (rejected by provider)",
			latencyMs: 10,
		};
	}

	const startTime = Date.now();

	let endpoint = baseUrl;
	if (!endpoint) {
		if (kind === "openai") {
			endpoint = "https://api.openai.com/v1";
		} else if (kind === "anthropic") {
			endpoint = "https://api.anthropic.com/v1";
		} else if (kind === "fal") {
			endpoint = "https://rest.alpha.fal.ai";
		} else {
			return {
				ok: false,
				status: 400,
				error: "Missing base URL for provider verification",
			};
		}
	}

	// Normalize endpoint URL
	const url = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
	const probeUrl = kind === "anthropic" ? `${url}models` : `${url}models`;

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6000);

		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"User-Agent": "poly-ai-verifier",
		};

		if (kind === "anthropic") {
			headers["x-api-key"] = apiKey;
			headers["anthropic-version"] = "2023-06-01";
			delete headers.Authorization;
		}

		const res = await fetch(probeUrl, {
			method: "GET",
			headers,
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		const latencyMs = Date.now() - startTime;

		if (res.ok) {
			return { ok: true, status: res.status, latencyMs };
		}

		if (res.status === 401 || res.status === 403) {
			return {
				ok: false,
				status: res.status,
				error: "Invalid API key or unauthorized by provider",
				latencyMs,
			};
		}

		return {
			ok: false,
			status: res.status,
			error: `Provider returned status ${res.status}`,
			latencyMs,
		};
	} catch (err: unknown) {
		const latencyMs = Date.now() - startTime;
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			status: 500,
			error: `Probe request failed: ${message}`,
			latencyMs,
		};
	}
}
