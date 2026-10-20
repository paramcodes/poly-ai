/**
 * GenerationEvent union and SSE helpers for Poly-AI media generation streaming.
 * See ADR-0005 (AI SDK v7 streaming over AG-UI) and ADR-0006 (resumable job model).
 */

export type GenerationEvent =
	| { type: "queued"; generationId: string }
	| {
			type: "progress";
			generationId: string;
			progress: number;
			message?: string;
	  }
	| { type: "partial"; generationId: string; url?: string; base64?: string }
	| {
			type: "complete";
			generationId: string;
			outputUrl: string;
			metadata?: Record<string, unknown>;
	  }
	| { type: "error"; generationId?: string; error: string };

export type GenerationEventType = GenerationEvent["type"];

/**
 * Type guard for validating arbitrary objects against the GenerationEvent union.
 */
export function isGenerationEvent(value: unknown): value is GenerationEvent {
	if (!value || typeof value !== "object") {
		return false;
	}
	const event = value as Record<string, unknown>;
	switch (event.type) {
		case "queued":
			return typeof event.generationId === "string";
		case "progress":
			return (
				typeof event.generationId === "string" &&
				typeof event.progress === "number" &&
				(event.message === undefined || typeof event.message === "string")
			);
		case "partial":
			return (
				typeof event.generationId === "string" &&
				(event.url === undefined || typeof event.url === "string") &&
				(event.base64 === undefined || typeof event.base64 === "string")
			);
		case "complete":
			return (
				typeof event.generationId === "string" &&
				typeof event.outputUrl === "string" &&
				(event.metadata === undefined ||
					(typeof event.metadata === "object" && event.metadata !== null))
			);
		case "error":
			return (
				typeof event.error === "string" &&
				(event.generationId === undefined ||
					typeof event.generationId === "string")
			);
		default:
			return false;
	}
}

/**
 * Formats a GenerationEvent as a standard Server-Sent Events (SSE) message block:
 * `event: <type>\ndata: <json>\n\n`
 */
export function formatSSEEvent(event: GenerationEvent): string {
	return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export interface ParsedSSELine {
	field: string;
	value: string;
}

/**
 * Parses a single SSE line into its field and value.
 * Comments (lines starting with ':') and empty lines return null.
 * Per the SSE spec, a single leading space after the colon separator is stripped.
 */
export function parseSSELine(line: string): ParsedSSELine | null {
	if (!line || line.startsWith(":")) {
		return null;
	}
	const colonIndex = line.indexOf(":");
	if (colonIndex === -1) {
		return {
			field: line.trim(),
			value: "",
		};
	}
	const field = line.slice(0, colonIndex).trim();
	let value = line.slice(colonIndex + 1);
	if (value.startsWith(" ")) {
		value = value.slice(1);
	}
	return { field, value };
}

/**
 * Parses one or more SSE message blocks from a chunk of text into GenerationEvents.
 * Supports multiple data lines, CRLF, and event annotations.
 */
export function parseSSEChunk(chunk: string): GenerationEvent[] {
	if (!chunk || !chunk.trim()) {
		return [];
	}

	const events: GenerationEvent[] = [];
	const normalized = chunk.replace(/\r\n/g, "\n");
	const blocks = normalized.split(/\n\n+/);

	for (const block of blocks) {
		const trimmed = block.trim();
		if (!trimmed) {
			continue;
		}

		const lines = trimmed.split("\n");
		let eventType: string | undefined;
		const dataLines: string[] = [];

		for (const line of lines) {
			const parsed = parseSSELine(line);
			if (!parsed) {
				continue;
			}
			if (parsed.field === "event") {
				eventType = parsed.value.trim();
			} else if (parsed.field === "data") {
				dataLines.push(parsed.value);
			}
		}

		if (dataLines.length === 0) {
			continue;
		}

		const combinedData = dataLines.join("\n");
		try {
			const parsedJson = JSON.parse(combinedData) as unknown;
			if (isGenerationEvent(parsedJson)) {
				events.push(parsedJson);
			} else if (
				typeof parsedJson === "object" &&
				parsedJson !== null &&
				eventType &&
				!("type" in parsedJson)
			) {
				const candidate = { type: eventType, ...parsedJson };
				if (isGenerationEvent(candidate)) {
					events.push(candidate);
				}
			}
		} catch {
			// Ignore unparseable JSON payloads
		}
	}

	return events;
}

/**
 * Asynchronously reads and yields GenerationEvents from a ReadableStream of Uint8Array chunks or strings.
 * Handles split chunks across stream boundaries safely and releases the stream reader lock on completion.
 */
export async function* parseSSEStream(
	stream: ReadableStream<Uint8Array | string>,
): AsyncGenerator<GenerationEvent, void, unknown> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			const textChunk =
				typeof value === "string"
					? value
					: decoder.decode(value, { stream: true });
			buffer += textChunk;

			const separatorRegex = /\r?\n\r?\n/g;
			let lastIndex = 0;
			let match = separatorRegex.exec(buffer);

			while (match !== null) {
				const block = buffer.slice(lastIndex, match.index);
				lastIndex = separatorRegex.lastIndex;
				const events = parseSSEChunk(block);
				for (const event of events) {
					yield event;
				}
				match = separatorRegex.exec(buffer);
			}

			buffer = buffer.slice(lastIndex);
		}

		if (buffer.trim()) {
			const events = parseSSEChunk(buffer);
			for (const event of events) {
				yield event;
			}
		}
	} finally {
		reader.releaseLock();
	}
}
