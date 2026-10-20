import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyIllustration } from "@/components/app/empty-illustration";
import { ImageGallery } from "@/components/app/image-gallery";
import { MediaHistory } from "@/components/app/media-history";
import { ShortcutsDialog } from "@/components/app/shortcuts-dialog";

describe("EmptyIllustration", () => {
	it("renders illustrations with expected data-slot and kind attribute", () => {
		const { container } = render(<EmptyIllustration kind="image" size="lg" />);
		const el = container.querySelector('[data-slot="empty-illustration"]');
		expect(el).toBeInTheDocument();
		expect(el).toHaveAttribute("data-kind", "image");
	});
});

describe("ShortcutsDialog", () => {
	it("renders trigger and displays shortcuts", () => {
		render(<ShortcutsDialog />);
		const trigger = screen.getByRole("button", {
			name: /keyboard shortcuts/i,
		});
		expect(trigger).toBeInTheDocument();

		fireEvent.click(trigger);
		expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
		expect(screen.getByText("Toggle sidebar")).toBeInTheDocument();
	});

	it("opens on '?' keypress", () => {
		render(<ShortcutsDialog />);
		fireEvent.keyDown(window, { key: "?" });
		expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
	});
});

describe("Skeletons during loading", () => {
	it("renders gallery skeletons when loading with zero images", () => {
		const { container } = render(
			<ImageGallery
				generations={[]}
				loading={true}
				onRefresh={vi.fn()}
				emptyModelName="FLUX Schnell"
			/>,
		);

		const skeletons = container.querySelector(
			'[data-slot="gallery-skeletons"]',
		);
		expect(skeletons).toBeInTheDocument();
		expect(
			screen.queryByText("No images generated yet"),
		).not.toBeInTheDocument();
	});

	it("renders media history skeletons when loading with zero records", () => {
		const { container } = render(
			<MediaHistory
				category="video"
				generations={[]}
				loading={true}
				onRefresh={vi.fn()}
				onRetry={vi.fn()}
				emptyModelName="Fal Video"
			/>,
		);

		const skeletons = container.querySelector(
			'[data-slot="history-skeletons"]',
		);
		expect(skeletons).toBeInTheDocument();
		expect(screen.queryByText("Ready to generate")).not.toBeInTheDocument();
	});
});
