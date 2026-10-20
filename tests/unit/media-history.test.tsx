import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type MediaGenerationRecord,
	MediaHistory,
} from "@/components/app/media-history";

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const succeeded: MediaGenerationRecord = {
	id: "gen-ok",
	category: "video",
	modelId: "fal-video",
	prompt: "A drone shot over a pine forest",
	status: "succeeded",
	outputUrl: "data:video/mp4;base64,AAAA",
	createdAt: "2026-01-01T00:00:00.000Z",
};

const failed: MediaGenerationRecord = {
	id: "gen-bad",
	category: "music",
	modelId: "fal-music",
	prompt: "A lo-fi beat",
	status: "failed",
	outputUrl: null,
	error: "The provider job failed",
	createdAt: "2026-01-01T00:00:00.000Z",
};

describe("MediaHistory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(navigator, {
			clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
		});
	});

	it("renders a video player for the video category", () => {
		const { container } = render(
			<MediaHistory
				category="video"
				generations={[succeeded]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		const video = container.querySelector("video");
		expect(video).toBeInTheDocument();
		expect(video).toHaveAttribute("src", succeeded.outputUrl ?? "");
		expect(container.querySelector("audio")).not.toBeInTheDocument();
	});

	it("renders an audio player for the music category", () => {
		const { container } = render(
			<MediaHistory
				category="music"
				generations={[{ ...succeeded, category: "music" }]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Music"
			/>,
		);

		const audio = container.querySelector("audio");
		expect(audio).toBeInTheDocument();
		expect(container.querySelector("video")).not.toBeInTheDocument();
	});

	it("shows the prompt, the model id and the status of a row", () => {
		render(
			<MediaHistory
				category="video"
				generations={[succeeded]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		expect(
			screen.getByText("A drone shot over a pine forest"),
		).toBeInTheDocument();
		expect(screen.getByText("fal-video")).toBeInTheDocument();
		expect(screen.getByText("succeeded")).toBeInTheDocument();
	});

	it("shows the error of a failed row and calls onRetry with its id", () => {
		const onRetry = vi.fn();
		render(
			<MediaHistory
				category="music"
				generations={[failed]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={onRetry}
				emptyModelName="Fal Music"
			/>,
		);

		expect(screen.getByText("The provider job failed")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledWith("gen-bad");
	});

	it("does not render a retry button for a successful row", () => {
		render(
			<MediaHistory
				category="video"
				generations={[succeeded]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		expect(
			screen.queryByRole("button", { name: /retry/i }),
		).not.toBeInTheDocument();
	});

	it("renders the empty state when no generations exist", () => {
		render(
			<MediaHistory
				category="video"
				generations={[]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		expect(screen.getByText("Ready to generate")).toBeInTheDocument();
		expect(screen.getByText(/Fal Video/)).toBeInTheDocument();
	});

	it("calls onRefresh when the refresh button is clicked", () => {
		const onRefresh = vi.fn();
		render(
			<MediaHistory
				category="video"
				generations={[succeeded]}
				loading={false}
				onRefresh={onRefresh}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
		expect(onRefresh).toHaveBeenCalled();
	});

	it("copies the prompt to the clipboard", async () => {
		render(
			<MediaHistory
				category="video"
				generations={[succeeded]}
				loading={false}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /copy/i }));

		await waitFor(() => {
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
				"A drone shot over a pine forest",
			);
		});
	});
});
