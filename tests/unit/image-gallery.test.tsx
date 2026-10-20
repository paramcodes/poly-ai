import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type GenerationRecord,
	ImageGallery,
} from "@/components/app/image-gallery";

const sampleGenerations: GenerationRecord[] = [
	{
		id: "gen-1",
		userId: "user-1",
		category: "image",
		providerId: "prov-img",
		modelId: "flux-schnell",
		prompt: "A futuristic neon city in Tokyo at night",
		status: "succeeded",
		outputUrl: "data:image/png;base64,mockpng",
		createdAt: new Date().toISOString(),
	},
];

describe("ImageGallery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(navigator, {
			clipboard: {
				writeText: vi.fn().mockResolvedValue(undefined),
			},
		});
	});

	it("renders the empty state when no generations exist", () => {
		render(
			<ImageGallery
				generations={[]}
				loading={false}
				onRefresh={vi.fn()}
				emptyModelName="FLUX Schnell"
			/>,
		);

		expect(screen.getByText("No images generated yet")).toBeInTheDocument();
		expect(screen.getByText(/FLUX Schnell/)).toBeInTheDocument();
	});

	it("renders gallery cards with prompt and model badge", () => {
		render(
			<ImageGallery
				generations={sampleGenerations}
				loading={false}
				onRefresh={vi.fn()}
				emptyModelName="FLUX Schnell"
			/>,
		);

		expect(
			screen.getByText("A futuristic neon city in Tokyo at night"),
		).toBeInTheDocument();
		expect(screen.getByText("flux-schnell")).toBeInTheDocument();
		expect(screen.getByText("Gallery")).toBeInTheDocument();
	});

	it("copies prompt to clipboard when copy button is clicked", async () => {
		render(
			<ImageGallery
				generations={sampleGenerations}
				loading={false}
				onRefresh={vi.fn()}
				emptyModelName="FLUX Schnell"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /copy/i }));

		await waitFor(() => {
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
				"A futuristic neon city in Tokyo at night",
			);
		});
	});

	it("calls onRefresh when the refresh button is clicked", () => {
		const onRefresh = vi.fn();
		render(
			<ImageGallery
				generations={sampleGenerations}
				loading={false}
				onRefresh={onRefresh}
				emptyModelName="FLUX Schnell"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
		expect(onRefresh).toHaveBeenCalled();
	});
});
