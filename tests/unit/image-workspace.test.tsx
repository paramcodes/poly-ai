import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageWorkspace } from "@/components/app/image-workspace";
import type { AssignedModel } from "@/components/settings/models-table";
import { formatSSEEvent } from "@/lib/generation/events";

const mockModel: AssignedModel = {
	id: "m-img",
	providerId: "prov-img",
	providerName: "Test Provider",
	providerStatus: "active",
	modelId: "flux-schnell",
	name: "FLUX Schnell",
	category: "image",
	capabilities: ["image"],
	enabled: "true",
};

describe("ImageWorkspace", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ generations: [] }),
		});
	});

	it("renders prompt input, aspect ratio select, and generate button", () => {
		render(
			<ImageWorkspace selectedModel={mockModel} initialGenerations={[]} />,
		);

		expect(
			screen.getByPlaceholderText(/Describe the image you want to generate/),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /generate/i }),
		).toBeInTheDocument();
		expect(screen.getByText("Aspect Ratio:")).toBeInTheDocument();
	});

	it("keeps the generate button disabled until a prompt is entered", () => {
		render(
			<ImageWorkspace selectedModel={mockModel} initialGenerations={[]} />,
		);

		const generateBtn = screen.getByRole("button", { name: /generate/i });
		expect(generateBtn).toBeDisabled();

		fireEvent.change(
			screen.getByPlaceholderText(/Describe the image you want to generate/),
			{ target: { value: "A majestic lion" } },
		);
		expect(generateBtn).toBeEnabled();
	});

	it("submits generation request and streams SSE updates", async () => {
		const sseText = [
			formatSSEEvent({ type: "queued", generationId: "gen-new" }),
			formatSSEEvent({
				type: "progress",
				generationId: "gen-new",
				progress: 60,
				message: "Rendering image...",
			}),
			formatSSEEvent({
				type: "complete",
				generationId: "gen-new",
				outputUrl: "data:image/png;base64,new",
			}),
		].join("");

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseText));
				controller.close();
			},
		});

		global.fetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes("/api/generate/image")) {
				return Promise.resolve({ ok: true, body: stream });
			}
			return Promise.resolve({
				ok: true,
				json: async () => ({ generations: [] }),
			});
		});

		render(
			<ImageWorkspace selectedModel={mockModel} initialGenerations={[]} />,
		);

		fireEvent.change(
			screen.getByPlaceholderText(/Describe the image you want to generate/),
			{ target: { value: "A majestic lion" } },
		);
		fireEvent.click(screen.getByRole("button", { name: /generate/i }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/generate/image",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("A majestic lion"),
				}),
			);
		});
	});
});
