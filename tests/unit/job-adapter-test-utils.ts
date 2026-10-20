import { vi } from "vitest";

export interface FetchCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | undefined;
}

export function jsonResponse(
	body: unknown,
	status = 200,
	statusText = "OK",
): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText,
		headers: { "Content-Type": "application/json" },
	});
}

export function stubFetch(responses: Response[]): FetchCall[] {
	const calls: FetchCall[] = [];
	let index = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({
				url: String(input),
				method: init?.method ?? "GET",
				headers: Object.fromEntries(new Headers(init?.headers)),
				body: typeof init?.body === "string" ? init.body : undefined,
			});
			const response = responses[index];
			index += 1;
			if (!response) {
				throw new Error(`Unexpected fetch call to ${String(input)}`);
			}
			return response;
		}),
	);
	return calls;
}

export function decodeDataUrl(dataUrl: string): Uint8Array {
	const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}
