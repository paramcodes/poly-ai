import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CategoryPage, {
	generateMetadata,
	generateStaticParams,
} from "../../src/app/app/[category]/page";
import { CategoryEmptyState } from "../../src/components/app/category-empty-state";
import { CategoryView } from "../../src/components/app/category-view";
import { ModelPicker } from "../../src/components/app/model-picker";
import type { AssignedModel } from "../../src/components/settings/models-table";
import { CATEGORIES, CATEGORY_META } from "../../src/lib/categories";
import { notifyCategoryEmpty } from "../../src/lib/toast";

const mockNotFound = vi.fn();

vi.mock("next/navigation", () => ({
	notFound: () => {
		mockNotFound();
		throw new Error("NEXT_NOT_FOUND");
	},
}));

vi.mock("@/lib/toast", () => ({
	notifyCategoryEmpty: vi.fn(),
}));

const mockActiveModel: AssignedModel = {
	id: "m-1",
	providerId: "p-1",
	providerName: "OpenAI",
	providerStatus: "active",
	modelId: "gpt-4o",
	name: "GPT-4o",
	category: "text",
	capabilities: ["text"],
	enabled: "true",
};

const mockSecondActiveModel: AssignedModel = {
	id: "m-2",
	providerId: "p-2",
	providerName: "Anthropic",
	providerStatus: "active",
	modelId: "claude-3-5-sonnet",
	name: "Claude 3.5 Sonnet",
	category: "text",
	capabilities: ["text"],
	enabled: "true",
};

const mockDisabledModel: AssignedModel = {
	id: "m-3",
	providerId: "p-1",
	providerName: "OpenAI",
	providerStatus: "active",
	modelId: "gpt-3.5-turbo",
	name: "GPT-3.5 Turbo",
	category: "text",
	capabilities: ["text"],
	enabled: "false",
};

const mockInvalidProviderModel: AssignedModel = {
	id: "m-4",
	providerId: "p-3",
	providerName: "Mistral",
	providerStatus: "invalid",
	modelId: "mistral-large",
	name: "Mistral Large",
	category: "text",
	capabilities: ["text"],
	enabled: "true",
};

describe("CategoryEmptyState", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders persistent card and calls notifyCategoryEmpty on mount for 'not-configured'", () => {
		render(<CategoryEmptyState category="text" reason="not-configured" />);

		expect(notifyCategoryEmpty).toHaveBeenCalledTimes(1);
		expect(notifyCategoryEmpty).toHaveBeenCalledWith("text", "not-configured");

		expect(
			screen.getByText("No models configured for Text"),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				/No active models are configured for Text. Configure a provider and enable models in Settings to get started./,
			),
		).toBeInTheDocument();

		const link = screen.getByRole("link", {
			name: /Configure Providers & Models/i,
		});
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/settings/providers");
	});

	it("renders card and calls notifyCategoryEmpty on mount for 'failed'", () => {
		render(<CategoryEmptyState category="image" reason="failed" />);

		expect(notifyCategoryEmpty).toHaveBeenCalledTimes(1);
		expect(notifyCategoryEmpty).toHaveBeenCalledWith("image", "failed");

		expect(
			screen.getByText("Provider verification failed"),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				/Provider verification failed for Image models. Check your provider settings in Settings to restore access./,
			),
		).toBeInTheDocument();

		const link = screen.getByRole("link", {
			name: /Configure Providers & Models/i,
		});
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/settings/providers");
	});
});

describe("ModelPicker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders disabled select with placeholder when models array is empty", () => {
		render(
			<ModelPicker
				models={[]}
				selectedModelId={null}
				onSelectModel={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole("combobox");
		expect(trigger).toBeDisabled();
		expect(screen.getByText("No models available")).toBeInTheDocument();
	});

	it("displays selected model name and provider badge", () => {
		render(
			<ModelPicker
				models={[mockActiveModel, mockSecondActiveModel]}
				selectedModelId="m-1"
				onSelectModel={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole("combobox");
		expect(trigger).not.toBeDisabled();
		expect(screen.getByText("GPT-4o")).toBeInTheDocument();
		expect(screen.getByText("OpenAI")).toBeInTheDocument();
	});

	it("renders placeholder when no model is selected", () => {
		render(
			<ModelPicker
				models={[mockActiveModel]}
				selectedModelId={null}
				onSelectModel={vi.fn()}
			/>,
		);

		expect(screen.getByText("Select a model")).toBeInTheDocument();
	});

	it("handles selection change when a model is chosen", async () => {
		window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
		window.HTMLElement.prototype.setPointerCapture = vi.fn();
		window.HTMLElement.prototype.releasePointerCapture = vi.fn();
		window.HTMLElement.prototype.scrollIntoView = vi.fn();

		const handleSelect = vi.fn();
		render(
			<ModelPicker
				models={[mockActiveModel, mockSecondActiveModel]}
				selectedModelId="m-1"
				onSelectModel={handleSelect}
			/>,
		);

		const trigger = screen.getByRole("combobox");
		fireEvent.keyDown(trigger, { key: "Enter" });

		const option = await screen.findByRole("option", {
			name: /Claude 3\.5 Sonnet/i,
		});
		fireEvent.keyDown(option, { key: "Enter" });

		expect(handleSelect).toHaveBeenCalledWith("m-2");
	});
});

describe("CategoryView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders skeleton loader while fetching", () => {
		const { promise } = Promise.withResolvers<Response>();
		vi.stubGlobal(
			"fetch",
			vi.fn(() => promise),
		);

		const { container } = render(<CategoryView category="text" />);
		expect(
			container.querySelector('[data-slot="category-skeleton"]'),
		).toBeInTheDocument();
	});
	it("renders empty state with 'not-configured' when no active models exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ models: [mockDisabledModel] }),
			})),
		);

		render(<CategoryView category="text" />);

		await waitFor(() => {
			expect(
				screen.getByText("No models configured for Text"),
			).toBeInTheDocument();
			expect(notifyCategoryEmpty).toHaveBeenCalledWith(
				"text",
				"not-configured",
			);
		});

		expect(
			screen.getByRole("link", { name: /Configure Providers & Models/i }),
		).toHaveAttribute("href", "/settings/providers");
	});

	it("renders empty state with 'failed' when models include invalid provider status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					models: [mockDisabledModel, mockInvalidProviderModel],
				}),
			})),
		);

		render(<CategoryView category="video" />);

		await waitFor(() => {
			expect(
				screen.getByText("Provider verification failed"),
			).toBeInTheDocument();
			expect(notifyCategoryEmpty).toHaveBeenCalledWith("video", "failed");
		});
	});

	it("renders generation workspace when active models exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					models: [mockActiveModel, mockSecondActiveModel],
				}),
			})),
		);

		render(<CategoryView category="text" />);

		await waitFor(() => {
			expect(screen.getByText("Text")).toBeInTheDocument();
		});

		// Header description
		expect(
			screen.getByText(CATEGORY_META.text.description),
		).toBeInTheDocument();

		// Model picker selected first active model by default
		expect(screen.getByText("GPT-4o")).toBeInTheDocument();
		expect(screen.getByText("OpenAI")).toBeInTheDocument();

		// Prompt input and generate button
		expect(
			screen.getByPlaceholderText(/Enter a prompt for text generation.../i),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Generate/i }),
		).toBeInTheDocument();

		// Empty output canvas
		expect(screen.getByText("Ready to generate")).toBeInTheDocument();
	});

	it("renders error view with retry button when fetch fails", async () => {
		const mockFetch = vi
			.fn()
			.mockRejectedValueOnce(new Error("Network connection error"))
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ models: [mockActiveModel] }),
			});

		vi.stubGlobal("fetch", mockFetch);

		render(<CategoryView category="music" />);

		await waitFor(() => {
			expect(screen.getByText("Failed to load models")).toBeInTheDocument();
		});
		expect(screen.getByText("Network connection error")).toBeInTheDocument();

		const retryBtn = screen.getByRole("button", { name: /Try again/i });
		fireEvent.click(retryBtn);

		await waitFor(() => {
			expect(screen.getByText("Ready to generate")).toBeInTheDocument();
		});
	});
});

describe("CategoryPage route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("generateStaticParams returns all 5 categories", () => {
		const params = generateStaticParams();
		expect(params).toEqual(CATEGORIES.map((category) => ({ category })));
	});

	it("generateMetadata returns category title and description for valid category", async () => {
		const meta = await generateMetadata({
			params: Promise.resolve({ category: "text" }),
		});
		expect(meta.title).toBe("Text — Poly-AI");
		expect(meta.description).toBe(CATEGORY_META.text.description);
	});

	it("generateMetadata returns Not Found title for invalid category", async () => {
		const meta = await generateMetadata({
			params: Promise.resolve({ category: "invalid-category" }),
		});
		expect(meta.title).toBe("Not Found — Poly-AI");
	});

	it("calls notFound() when category parameter is invalid", async () => {
		await expect(
			CategoryPage({
				params: Promise.resolve({ category: "unknown" }),
			}),
		).rejects.toThrow("NEXT_NOT_FOUND");

		expect(mockNotFound).toHaveBeenCalledTimes(1);
	});

	it("renders CategoryView when category parameter is valid", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ models: [mockActiveModel] }),
			})),
		);

		const jsx = await CategoryPage({
			params: Promise.resolve({ category: "website" }),
		});

		render(jsx);

		await waitFor(() => {
			expect(screen.getByText("Website")).toBeInTheDocument();
		});
		expect(
			screen.getByText(CATEGORY_META.website.description),
		).toBeInTheDocument();
	});
});
