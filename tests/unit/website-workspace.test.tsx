import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { streamText } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteWorkspace } from "@/components/app/website-workspace";
import type { AssignedModel } from "@/components/settings/models-table";

const mockModel: AssignedModel = {
	id: "m-web-1",
	providerId: "prov-openai",
	providerName: "OpenAI",
	providerStatus: "active",
	modelId: "gpt-4o",
	name: "GPT-4o",
	category: "website",
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
								total: 10,
								noCache: 10,
								cacheRead: 0,
								cacheWrite: 0,
							},
							outputTokens: { total: 10, text: 10, reasoning: 0 },
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
		messages: [{ role: "user", content: "Build a site" }],
	});

	return result.toUIMessageStreamResponse();
}

describe("WebsiteWorkspace", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders resizable dual-pane layout, model info, prompt input, and ready state", () => {
		render(<WebsiteWorkspace selectedModel={mockModel} />);

		// Model header in left panel
		expect(screen.getByText("GPT-4o")).toBeInTheDocument();
		expect(screen.getByText("OpenAI")).toBeInTheDocument();

		// Ready placeholder in left panel
		expect(screen.getByText("Ready to generate")).toBeInTheDocument();

		// Prompt input and disabled generate button
		const input = screen.getByPlaceholderText(
			/Enter a prompt for website generation.../i,
		);
		expect(input).toBeInTheDocument();
		const generateBtn = screen.getByRole("button", { name: /Generate/i });
		expect(generateBtn).toBeDisabled();

		// Right pane tabs: Preview and Code
		expect(screen.getByRole("tab", { name: /Preview/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /Code/i })).toBeInTheDocument();

		// Device width buttons in header
		expect(
			screen.getByRole("button", { name: /Desktop/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Tablet/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Mobile/i })).toBeInTheDocument();
	});

	it("dispatches request to /api/generate/website with providerId and modelId on submit", async () => {
		const captured: {
			url: string;
			body: {
				providerId?: string;
				modelId?: string;
				messages?: unknown[];
			} | null;
		} = { url: "", body: null };

		const emittedHtml =
			"```html\n<!DOCTYPE html><html><body><h1>Generated Website</h1></body></html>\n```";

		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				captured.url = url;
				if (typeof init?.body === "string") {
					captured.body = JSON.parse(init.body);
				}
				return createStreamResponse(emittedHtml);
			}),
		);

		render(<WebsiteWorkspace selectedModel={mockModel} />);

		const input = screen.getByPlaceholderText(
			/Enter a prompt for website generation.../i,
		);
		const generateBtn = screen.getByRole("button", { name: /Generate/i });

		fireEvent.change(input, {
			target: { value: "Create a modern coffee shop website" },
		});
		expect(generateBtn).not.toBeDisabled();

		fireEvent.click(generateBtn);

		await waitFor(() => {
			expect(captured.body).not.toBeNull();
		});

		expect(captured.url).toBe("/api/generate/website");
		expect(captured.body?.providerId).toBe("prov-openai");
		expect(captured.body?.modelId).toBe("gpt-4o");
		expect(captured.body?.messages).toBeDefined();

		// Wait for streamed assistant response and extracted HTML inside preview iframe
		await waitFor(() => {
			const iframe = screen.getByTitle("Website Preview");
			expect(iframe.getAttribute("srcDoc")).toContain("Generated Website");
		});

		// Check left pane reflects completion status
		expect(screen.getByText("Website HTML generated")).toBeInTheDocument();
	});

	it("switches to Code tab and renders extracted HTML code with line numbers", async () => {
		const emittedHtml =
			"```html\n<!DOCTYPE html>\n<html>\n<body>\n<h1>Tab Test</h1>\n</body>\n</html>\n```";

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => createStreamResponse(emittedHtml)),
		);

		render(<WebsiteWorkspace selectedModel={mockModel} />);

		const input = screen.getByPlaceholderText(
			/Enter a prompt for website generation.../i,
		);
		fireEvent.change(input, { target: { value: "Build a site" } });
		fireEvent.click(screen.getByRole("button", { name: /Generate/i }));

		await waitFor(() => {
			const iframe = screen.getByTitle("Website Preview");
			expect(iframe.getAttribute("srcDoc")).toContain("Tab Test");
		});

		// Switch to Code tab
		const codeTab = screen.getByRole("tab", { name: /Code/i });
		fireEvent.click(codeTab);

		await waitFor(() => {
			expect(screen.getByText(/Tab Test/)).toBeInTheDocument();
		});
	});

	it("copies extracted HTML via right header copy button", async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, {
			clipboard: {
				writeText: writeTextMock,
			},
		});

		const emittedHtml =
			"```html\n<!DOCTYPE html><html><body><h1>Copy Header</h1></body></html>\n```";

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => createStreamResponse(emittedHtml)),
		);

		render(<WebsiteWorkspace selectedModel={mockModel} />);

		const input = screen.getByPlaceholderText(
			/Enter a prompt for website generation.../i,
		);
		fireEvent.change(input, { target: { value: "Generate site" } });
		fireEvent.click(screen.getByRole("button", { name: /Generate/i }));

		await waitFor(() => {
			const iframe = screen.getByTitle("Website Preview");
			expect(iframe.getAttribute("srcDoc")).toContain("Copy Header");
		});

		// Header copy button should be enabled and clickable
		const copyBtns = screen.getAllByRole("button", { name: /Copy/i });
		fireEvent.click(copyBtns[0]);

		await waitFor(() => {
			expect(writeTextMock).toHaveBeenCalled();
			expect(writeTextMock.mock.calls[0][0]).toContain("Copy Header");
		});
	});

	it("downloads index.html via right header download button", async () => {
		const createObjectURLMock = vi.fn(() => "blob:http://localhost/test-blob");
		const revokeObjectURLMock = vi.fn();
		global.URL.createObjectURL = createObjectURLMock;
		global.URL.revokeObjectURL = revokeObjectURLMock;

		const clickMock = vi.fn();
		const originalCreateElement = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation(
			(tagName: string) => {
				const el = originalCreateElement(tagName);
				if (tagName.toLowerCase() === "a") {
					el.click = clickMock;
				}
				return el;
			},
		);

		const emittedHtml =
			"```html\n<!DOCTYPE html><html><body><h1>Download Header</h1></body></html>\n```";

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => createStreamResponse(emittedHtml)),
		);

		render(<WebsiteWorkspace selectedModel={mockModel} />);

		const input = screen.getByPlaceholderText(
			/Enter a prompt for website generation.../i,
		);
		fireEvent.change(input, { target: { value: "Generate site" } });
		fireEvent.click(screen.getByRole("button", { name: /Generate/i }));

		await waitFor(() => {
			const iframe = screen.getByTitle("Website Preview");
			expect(iframe.getAttribute("srcDoc")).toContain("Download Header");
		});

		const downloadBtn = screen.getByRole("button", {
			name: /Download \.html file/i,
		});
		fireEvent.click(downloadBtn);

		expect(createObjectURLMock).toHaveBeenCalledTimes(1);
		expect(clickMock).toHaveBeenCalledTimes(1);
		expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
	});
});
