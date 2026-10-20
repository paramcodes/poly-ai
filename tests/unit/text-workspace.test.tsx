import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { streamText, type UIMessage } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	extractMessageReasoning,
	extractMessageText,
	TextWorkspace,
} from "@/components/app/text-workspace";
import type { AssignedModel } from "@/components/settings/models-table";

const mockModel: AssignedModel = {
	id: "m-1",
	providerId: "prov-openai",
	providerName: "OpenAI",
	providerStatus: "active",
	modelId: "gpt-4o",
	name: "GPT-4o",
	category: "text",
	capabilities: ["text"],
	enabled: "true",
};

function createStreamResponse(output: string) {
	const mockLanguageModel = new MockLanguageModelV4({
		doStream: (async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "text-start", id: "1" },
					{ type: "text-delta", id: "1", delta: output },
					{ type: "text-end", id: "1" },
					{
						type: "finish" as const,
						finishReason: "stop" as const,
						usage: {
							inputTokens: {
								total: 5,
								noCache: 5,
								cacheRead: 0,
								cacheWrite: 0,
							},
							outputTokens: { total: 5, text: 5, reasoning: 0 },
						},
					},
				],
			}),
		})) as NonNullable<
			ConstructorParameters<typeof MockLanguageModelV4>[0]
		>["doStream"],
	});

	const result = streamText({
		model: mockLanguageModel,
		messages: [{ role: "user", content: "Hi" }],
	});

	return result.toUIMessageStreamResponse();
}

describe("TextWorkspace", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders empty state, prompt textarea, and disabled generate button initially", () => {
		render(<TextWorkspace selectedModel={mockModel} />);

		expect(screen.getByText("Ready to generate")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Enter a prompt and select a model to create text content.",
			),
		).toBeInTheDocument();

		const input = screen.getByPlaceholderText(
			/Enter a prompt for text generation.../i,
		);
		expect(input).toBeInTheDocument();

		const generateBtn = screen.getByRole("button", { name: /Generate/i });
		expect(generateBtn).toBeInTheDocument();
		expect(generateBtn).toBeDisabled();

		// Clear chat button should not be present when messages list is empty
		expect(
			screen.queryByRole("button", { name: /Clear chat/i }),
		).not.toBeInTheDocument();
	});

	it("dispatches message with providerId and modelId via prepareSendMessagesRequest", async () => {
		const captured: {
			body: {
				providerId?: string;
				modelId?: string;
				messages?: unknown[];
			} | null;
		} = { body: null };
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				if (typeof init?.body === "string") {
					captured.body = JSON.parse(init.body);
				}
				return createStreamResponse("Streamed assistant response");
			}),
		);

		render(<TextWorkspace selectedModel={mockModel} />);

		const input = screen.getByPlaceholderText(
			/Enter a prompt for text generation.../i,
		);
		const generateBtn = screen.getByRole("button", { name: /Generate/i });

		fireEvent.change(input, { target: { value: "Hello AI" } });
		expect(generateBtn).not.toBeDisabled();

		fireEvent.click(generateBtn);

		await waitFor(() => {
			expect(captured.body).not.toBeNull();
		});

		if (!captured.body) {
			throw new Error("Expected captured.body to be defined");
		}

		expect(captured.body.providerId).toBe("prov-openai");
		expect(captured.body.modelId).toBe("gpt-4o");
		expect(Array.isArray(captured.body.messages)).toBe(true);
		// Incoming streamed text updates assistant message incrementally
		await waitFor(() => {
			expect(
				screen.getByText("Streamed assistant response"),
			).toBeInTheDocument();
		});
	});

	it("submits prompt on Enter and preserves newline on Shift+Enter", async () => {
		let submitCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				submitCount++;
				return createStreamResponse("Response");
			}),
		);

		render(<TextWorkspace selectedModel={mockModel} />);
		const input = screen.getByPlaceholderText(
			/Enter a prompt for text generation.../i,
		);

		fireEvent.change(input, { target: { value: "Test enter" } });

		// Shift+Enter should not submit
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		expect(submitCount).toBe(0);

		// Enter without shift submits
		fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
		await waitFor(() => {
			expect(submitCount).toBe(1);
		});
	});

	it("renders stop button during generation and cancels stream when clicked", async () => {
		let signalAborted = false;

		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				if (init?.signal) {
					init.signal.addEventListener("abort", () => {
						signalAborted = true;
					});
				}
				const stream = new ReadableStream({
					start() {},
				});
				return new Response(stream, {
					headers: { "content-type": "text/event-stream" },
				});
			}),
		);

		render(<TextWorkspace selectedModel={mockModel} />);
		const input = screen.getByPlaceholderText(
			/Enter a prompt for text generation.../i,
		);
		const generateBtn = screen.getByRole("button", { name: /Generate/i });

		fireEvent.change(input, { target: { value: "Long stream query" } });
		fireEvent.click(generateBtn);

		const stopBtn = await screen.findByRole("button", {
			name: /Stop generation/i,
		});
		expect(stopBtn).toBeInTheDocument();

		fireEvent.click(stopBtn);

		await waitFor(() => {
			expect(signalAborted).toBe(true);
		});
	});

	it("clears chat messages when Clear chat is clicked", async () => {
		const initialMessages: UIMessage[] = [
			{
				id: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Hello" }],
			},
			{
				id: "msg-2",
				role: "assistant",
				parts: [{ type: "text", text: "Hi there!" }],
			},
		];

		render(
			<TextWorkspace
				selectedModel={mockModel}
				initialMessages={initialMessages}
			/>,
		);

		expect(screen.getByText("Hello")).toBeInTheDocument();
		expect(screen.getByText("Hi there!")).toBeInTheDocument();

		const clearBtn = screen.getByRole("button", { name: /Clear chat/i });
		fireEvent.click(clearBtn);

		await waitFor(() => {
			expect(screen.getByText("Ready to generate")).toBeInTheDocument();
			expect(screen.queryByText("Hello")).not.toBeInTheDocument();
		});
	});

	it("renders formatted markdown elements and reasoning process", () => {
		const messagesWithMarkdown: UIMessage[] = [
			{
				id: "msg-1",
				role: "assistant",
				parts: [
					{ type: "reasoning", text: "Analyzing query structure" },
					{
						type: "text",
						text: "Here is code:\n```typescript\nconst answer = 42;\n```\nAnd **bold** with `inline code`.",
					},
				],
			},
		];

		render(
			<TextWorkspace
				selectedModel={mockModel}
				initialMessages={messagesWithMarkdown}
			/>,
		);

		expect(screen.getByText("Thinking process")).toBeInTheDocument();
		expect(screen.getByText("Analyzing query structure")).toBeInTheDocument();
		expect(screen.getByText("typescript")).toBeInTheDocument();
		expect(screen.getByText("const answer = 42;")).toBeInTheDocument();
		expect(screen.getByText("bold")).toBeInTheDocument();
		expect(screen.getByText("inline code")).toBeInTheDocument();
	});

	it("extractMessageText and extractMessageReasoning correctly extract content from UIMessage shapes", () => {
		expect(extractMessageText({ content: "Direct content" })).toBe(
			"Direct content",
		);
		expect(
			extractMessageText({
				id: "1",
				role: "assistant",
				parts: [
					{ type: "text", text: "Part 1 " },
					{ type: "reasoning", text: "reasoning part" },
					{ type: "text", text: "Part 2" },
				],
			}),
		).toBe("Part 1 Part 2");

		expect(
			extractMessageReasoning({
				id: "1",
				role: "assistant",
				parts: [
					{ type: "text", text: "Part 1" },
					{ type: "reasoning", text: "reasoning part" },
				],
			}),
		).toBe("reasoning part");

		expect(extractMessageText({})).toBe("");
		expect(extractMessageReasoning({})).toBe("");
	});

	it("displays error message when generation fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
					status: 429,
					headers: { "content-type": "application/json" },
				});
			}),
		);

		render(<TextWorkspace selectedModel={mockModel} />);
		const input = screen.getByPlaceholderText(
			/Enter a prompt for text generation.../i,
		);
		const generateBtn = screen.getByRole("button", { name: /Generate/i });

		fireEvent.change(input, { target: { value: "Trigger failure" } });
		fireEvent.click(generateBtn);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});
	});

	it("copies message text to clipboard when copy button is clicked", async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, {
			clipboard: {
				writeText: writeTextMock,
			},
		});

		const initialMessages: UIMessage[] = [
			{
				id: "msg-1",
				role: "assistant",
				parts: [{ type: "text", text: "Copyable response" }],
			},
		];

		render(
			<TextWorkspace
				selectedModel={mockModel}
				initialMessages={initialMessages}
			/>,
		);

		const copyBtn = screen.getByRole("button", { name: /Copy to clipboard/i });
		fireEvent.click(copyBtn);

		expect(writeTextMock).toHaveBeenCalledWith("Copyable response");
	});
});
