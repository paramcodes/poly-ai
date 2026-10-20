import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CATEGORIES,
	CATEGORY_META,
	type Category,
} from "../../src/lib/categories";
import { notifyCategoryEmpty } from "../../src/lib/toast";

vi.mock("sonner", () => ({
	toast: {
		warning: vi.fn((_title, _options) => "toast-warning-id"),
		error: vi.fn((_title, _options) => "toast-error-id"),
	},
}));

describe("notifyCategoryEmpty", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("reason: 'not-configured'", () => {
		it("calls toast.warning with amber severity and does not call toast.error", () => {
			const id = notifyCategoryEmpty("text", "not-configured");

			expect(toast.warning).toHaveBeenCalledTimes(1);
			expect(toast.error).not.toHaveBeenCalled();
			expect(id).toBe("toast-warning-id");
		});

		it("includes category name from CATEGORY_META and guides user to Settings", () => {
			notifyCategoryEmpty("text", "not-configured");

			expect(toast.warning).toHaveBeenCalledWith(
				expect.stringContaining("Text"),
				expect.objectContaining({
					id: "empty-category-text",
					description: expect.stringMatching(/Settings/i),
				}),
			);
		});

		it("sets fixed deduplication id for all categories", () => {
			for (const category of CATEGORIES) {
				vi.clearAllMocks();
				notifyCategoryEmpty(category, "not-configured");

				expect(toast.warning).toHaveBeenCalledWith(
					expect.stringContaining(CATEGORY_META[category].name),
					expect.objectContaining({
						id: `empty-category-${category}`,
					}),
				);
			}
		});
	});

	describe("reason: 'failed'", () => {
		it("calls toast.error with red severity and does not call toast.warning", () => {
			const id = notifyCategoryEmpty("image", "failed");

			expect(toast.error).toHaveBeenCalledTimes(1);
			expect(toast.warning).not.toHaveBeenCalled();
			expect(id).toBe("toast-error-id");
		});

		it("includes category name from CATEGORY_META and describes verification failure", () => {
			notifyCategoryEmpty("image", "failed");

			expect(toast.error).toHaveBeenCalledWith(
				expect.stringContaining("Image"),
				expect.objectContaining({
					id: "empty-category-image",
					description: expect.stringMatching(/verification failed/i),
				}),
			);
		});

		it("sets fixed deduplication id for all categories", () => {
			for (const category of CATEGORIES) {
				vi.clearAllMocks();
				notifyCategoryEmpty(category, "failed");

				expect(toast.error).toHaveBeenCalledWith(
					expect.stringContaining(CATEGORY_META[category].name),
					expect.objectContaining({
						id: `empty-category-${category}`,
					}),
				);
			}
		});
	});

	describe("categories coverage", () => {
		it.each(
			CATEGORIES,
		)("correctly notifies for category %s", (category: Category) => {
			const meta = CATEGORY_META[category];

			// Not configured -> warning
			notifyCategoryEmpty(category, "not-configured");
			expect(toast.warning).toHaveBeenCalledWith(
				expect.stringContaining(meta.name),
				expect.objectContaining({
					id: `empty-category-${category}`,
				}),
			);

			// Failed -> error
			notifyCategoryEmpty(category, "failed");
			expect(toast.error).toHaveBeenCalledWith(
				expect.stringContaining(meta.name),
				expect.objectContaining({
					id: `empty-category-${category}`,
				}),
			);
		});
	});
});
