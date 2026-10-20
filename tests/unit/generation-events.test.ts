import { describe, expect, it } from "vitest";
import {
	formatSSEEvent,
	type GenerationEvent,
	isGenerationEvent,
	parseSSEChunk,
	parseSSELine,
	parseSSEStream,
} from "../../src/lib/generation/events";

describe("GenerationEvent and SSE helpers", () => {
	it("formats all GenerationEvent variants to standard SSE strings", () => {
		const queued: GenerationEvent = { type: "queued", generationId: "g1" };
		const progress: GenerationEvent = {
			type: "progress",
			generationId: "g1",
			progress: 50,
			message: "Working",
		};
		const partial: GenerationEvent = {
			type: "partial",
			generationId: "g1",
			url: "http://example.com/p.png",
		};
		const complete: GenerationEvent = {
			type: "complete",
			generationId: "g1",
			outputUrl: "http://example.com/c.png",
			metadata: { seed: 1 },
		};
		const error: GenerationEvent = {
			type: "error",
			generationId: "g1",
			error: "Boom",
		};

		expect(formatSSEEvent(queued)).toBe(
			'event: queued\ndata: {"type":"queued","generationId":"g1"}\n\n',
		);
		expect(formatSSEEvent(progress)).toBe(
			'event: progress\ndata: {"type":"progress","generationId":"g1","progress":50,"message":"Working"}\n\n',
		);
		expect(formatSSEEvent(partial)).toBe(
			'event: partial\ndata: {"type":"partial","generationId":"g1","url":"http://example.com/p.png"}\n\n',
		);
		expect(formatSSEEvent(complete)).toBe(
			'event: complete\ndata: {"type":"complete","generationId":"g1","outputUrl":"http://example.com/c.png","metadata":{"seed":1}}\n\n',
		);
		expect(formatSSEEvent(error)).toBe(
			'event: error\ndata: {"type":"error","generationId":"g1","error":"Boom"}\n\n',
		);
	});

	it("validates event shapes with isGenerationEvent type guard", () => {
		expect(isGenerationEvent({ type: "queued", generationId: "g1" })).toBe(
			true,
		);
		expect(
			isGenerationEvent({ type: "progress", generationId: "g1", progress: 75 }),
		).toBe(true);
		expect(
			isGenerationEvent({
				type: "complete",
				generationId: "g1",
				outputUrl: "http://url",
			}),
		).toBe(true);
		expect(isGenerationEvent({ type: "error", error: "bad" })).toBe(true);
		expect(isGenerationEvent({ type: "unknown" })).toBe(false);
		expect(isGenerationEvent(null)).toBe(false);
		expect(isGenerationEvent("not-an-object")).toBe(false);
	});

	it("parses single SSE line field and values", () => {
		expect(parseSSELine("event: queued")).toEqual({
			field: "event",
			value: "queued",
		});
		expect(parseSSELine('data: {"test":1}')).toEqual({
			field: "data",
			value: '{"test":1}',
		});
		expect(parseSSELine(":comment")).toBeNull();
		expect(parseSSELine("")).toBeNull();
	});

	it("parses multi-event SSE chunks", () => {
		const chunk = [
			"event: queued",
			'data: {"type":"queued","generationId":"g1"}',
			"",
			"event: complete",
			'data: {"type":"complete","generationId":"g1","outputUrl":"http://img.png"}',
			"",
			"",
		].join("\n");

		const parsed = parseSSEChunk(chunk);
		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toEqual({ type: "queued", generationId: "g1" });
		expect(parsed[1]).toEqual({
			type: "complete",
			generationId: "g1",
			outputUrl: "http://img.png",
		});
	});

	it("reads async stream chunks via parseSSEStream generator", async () => {
		const text = formatSSEEvent({
			type: "progress",
			generationId: "g1",
			progress: 90,
		});
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(text));
				controller.close();
			},
		});

		const events: GenerationEvent[] = [];
		for await (const event of parseSSEStream(stream)) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			type: "progress",
			generationId: "g1",
			progress: 90,
		});
	});
});
