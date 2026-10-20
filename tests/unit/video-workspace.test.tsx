import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoWorkspace } from "@/components/app/video-workspace";
import type { AssignedModel } from "@/components/settings/models-table";

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockModel: AssignedModel = {
	id: "m-vid",
	providerId: "prov-vid",
	providerName: "Test Provider",
	providerStatus: "active",
	modelId: "fal-video",
	name: "Fal Video",
	category: "video",
	capabilities: ["video"],
	enabled: "true",
};

const jsonResponse = (body: unknown, status = 200) => ({
	ok: true,
	status,
	json: async () => body,
});

describe("VideoWorkspace", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("posts the trimmed prompt, the provider and the model to the video route", async () => {
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url === "/api/generations?category=video") {
				return jsonResponse({ generations: [] });
			}
			if (url === "/api/generate/video") {
				return jsonResponse(
					{ generation: { id: "gen-1", status: "queued" } },
					202,
				);
			}
			return jsonResponse({ generation: { id: "gen-1", status: "queued" } });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<VideoWorkspace selectedModel={mockModel} />);

		fireEvent.change(screen.getByLabelText("Prompt"), {
			target: { value: "  A drone shot over a pine forest  " },
		});
		fireEvent.click(screen.getByRole("button", { name: /generate/i }));

		await waitFor(() => {
			expect(
				fetchMock.mock.calls.some(([url]) => url === "/api/generate/video"),
			).toBe(true);
		});

		const call = fetchMock.mock.calls.find(
			([url]) => url === "/api/generate/video",
		);
		const init = call?.[1] as RequestInit;
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			prompt: "A drone shot over a pine forest",
			providerId: "prov-vid",
			modelId: "fal-video",
		});
	});

	it("polls the job and shows the video player once it succeeds", async () => {
		vi.useFakeTimers();

		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url === "/api/generations?category=video") {
				return jsonResponse({ generations: [] });
			}
			if (url === "/api/generate/video") {
				return jsonResponse(
					{ generation: { id: "gen-1", status: "queued" } },
					202,
				);
			}
			if (url === "/api/generations/gen-1") {
				return jsonResponse({
					generation: {
						id: "gen-1",
						status: "succeeded",
						outputUrl: "data:video/mp4;base64,AAAA",
					},
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { container } = render(<VideoWorkspace selectedModel={mockModel} />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		await act(async () => {
			fireEvent.change(screen.getByLabelText("Prompt"), {
				target: { value: "A drone shot over a pine forest" },
			});
			fireEvent.click(screen.getByRole("button", { name: /generate/i }));
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(
			fetchMock.mock.calls.some(([url]) => url === "/api/generations/gen-1"),
		).toBe(false);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(
			fetchMock.mock.calls.some(([url]) => url === "/api/generations/gen-1"),
		).toBe(true);
		expect(container.querySelector("video")).toBeInTheDocument();
		expect(toast.success).toHaveBeenCalled();
	});

	it("shows an error toast when the job fails", async () => {
		vi.useFakeTimers();

		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url === "/api/generations?category=video") {
				return jsonResponse({ generations: [] });
			}
			if (url === "/api/generate/video") {
				return jsonResponse(
					{ generation: { id: "gen-2", status: "running" } },
					202,
				);
			}
			if (url === "/api/generations/gen-2") {
				return jsonResponse({
					generation: {
						id: "gen-2",
						status: "failed",
						error: "The provider job failed",
					},
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<VideoWorkspace selectedModel={mockModel} />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		await act(async () => {
			fireEvent.change(screen.getByLabelText("Prompt"), {
				target: { value: "A drone shot over a pine forest" },
			});
			fireEvent.click(screen.getByRole("button", { name: /generate/i }));
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(screen.getByText("Rendering")).toBeInTheDocument();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(toast.error).toHaveBeenCalledWith("The provider job failed");
	});
});
