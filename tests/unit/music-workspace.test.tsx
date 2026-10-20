import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicWorkspace } from "@/components/app/music-workspace";
import type { AssignedModel } from "@/components/settings/models-table";

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockModel: AssignedModel = {
	id: "m-mus",
	providerId: "prov-mus",
	providerName: "Test Provider",
	providerStatus: "active",
	modelId: "fal-music",
	name: "Fal Music",
	category: "music",
	capabilities: ["audio"],
	enabled: "true",
};

const jsonResponse = (body: unknown, status = 200) => ({
	ok: true,
	status,
	json: async () => body,
});

describe("MusicWorkspace", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("posts mode voice to the music route in voice mode and does not poll", async () => {
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url === "/api/generations?category=music") {
				return jsonResponse({ generations: [] });
			}
			if (url === "/api/generate/music") {
				return jsonResponse({
					generation: {
						id: "gen-voice",
						status: "succeeded",
						outputUrl: "data:audio/mp3;base64,AAAA",
					},
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { container } = render(<MusicWorkspace selectedModel={mockModel} />);

		fireEvent.click(screen.getByRole("button", { name: "Voice" }));
		fireEvent.change(screen.getByLabelText("Prompt"), {
			target: { value: "Hello there, this is a test" },
		});
		fireEvent.click(screen.getByRole("button", { name: /generate/i }));

		await waitFor(() => {
			expect(
				fetchMock.mock.calls.some(([url]) => url === "/api/generate/music"),
			).toBe(true);
		});

		const call = fetchMock.mock.calls.find(
			([url]) => url === "/api/generate/music",
		);
		const init = call?.[1] as RequestInit;
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			prompt: "Hello there, this is a test",
			providerId: "prov-mus",
			modelId: "fal-music",
			mode: "voice",
		});

		// Text to speech finishes immediately, so no job is polled.
		expect(
			fetchMock.mock.calls.some(
				([url]) =>
					typeof url === "string" && url.startsWith("/api/generations/"),
			),
		).toBe(false);
		expect(container.querySelector("audio")).toBeInTheDocument();
		expect(toast.success).toHaveBeenCalled();
	});

	it("polls the job and shows the audio player once the song succeeds", async () => {
		vi.useFakeTimers();

		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url === "/api/generations?category=music") {
				return jsonResponse({ generations: [] });
			}
			if (url === "/api/generate/music") {
				return jsonResponse(
					{ generation: { id: "gen-song", status: "queued" } },
					202,
				);
			}
			if (url === "/api/generations/gen-song") {
				return jsonResponse({
					generation: {
						id: "gen-song",
						status: "succeeded",
						outputUrl: "data:audio/mp3;base64,AAAA",
					},
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { container } = render(<MusicWorkspace selectedModel={mockModel} />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		await act(async () => {
			fireEvent.change(screen.getByLabelText("Prompt"), {
				target: { value: "A lo-fi hip hop beat" },
			});
			fireEvent.click(screen.getByRole("button", { name: /generate/i }));
			await vi.advanceTimersByTimeAsync(0);
		});

		const call = fetchMock.mock.calls.find(
			([url]) => url === "/api/generate/music",
		);
		const init = call?.[1] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({
			prompt: "A lo-fi hip hop beat",
			providerId: "prov-mus",
			modelId: "fal-music",
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(
			fetchMock.mock.calls.some(([url]) => url === "/api/generations/gen-song"),
		).toBe(true);
		expect(container.querySelector("audio")).toBeInTheDocument();
	});
});
