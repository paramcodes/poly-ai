"use client";

import { Loader2, Sparkles } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	type MediaGenerationRecord,
	MediaHistory,
	type MediaJobResult,
	useMediaJob,
} from "@/components/app/media-history";
import type { AssignedModel } from "@/components/settings/models-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export interface VideoWorkspaceProps {
	selectedModel: AssignedModel;
}

const STAGE_TEXT: Record<"queued" | "running", string> = {
	queued: "Waiting in the queue",
	running: "Rendering",
};

export function VideoWorkspace({ selectedModel }: VideoWorkspaceProps) {
	const [prompt, setPrompt] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [generations, setGenerations] = useState<MediaGenerationRecord[]>([]);
	const [loadingHistory, setLoadingHistory] = useState(true);
	const [result, setResult] = useState<MediaJobResult | null>(null);

	const fetchGenerations = useCallback(async () => {
		try {
			setLoadingHistory(true);
			const res = await fetch("/api/generations?category=video");
			if (!res.ok) return;
			const data = (await res.json()) as {
				generations: MediaGenerationRecord[];
			};
			setGenerations(data.generations || []);
		} catch {
			// Non-blocking history load
		} finally {
			setLoadingHistory(false);
		}
	}, []);

	useEffect(() => {
		fetchGenerations();
	}, [fetchGenerations]);

	const handleSuccess = useCallback(
		(generation: MediaJobResult) => {
			setResult(generation);
			setPrompt("");
			toast.success("Video generated successfully!");
			fetchGenerations();
		},
		[fetchGenerations],
	);

	const handleFailure = useCallback((message: string) => {
		toast.error(message);
	}, []);

	const { running, stage, start } = useMediaJob({
		onSuccess: handleSuccess,
		onFailure: handleFailure,
	});

	const busy = submitting || running;

	const handleGenerate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || busy) return;

		setSubmitting(true);
		setResult(null);

		try {
			const res = await fetch("/api/generate/video", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: prompt.trim(),
					providerId: selectedModel.providerId,
					modelId: selectedModel.modelId,
				}),
			});

			if (!res.ok) {
				const errJson = await res.json().catch(() => ({}));
				throw new Error(
					errJson.error || `Generation failed with status ${res.status}`,
				);
			}

			const data = (await res.json()) as { generation: MediaJobResult };
			const generation = data.generation;

			if (generation.status === "succeeded") {
				handleSuccess(generation);
				return;
			}
			start(
				generation.id,
				generation.status === "running" ? "running" : "queued",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Video generation failed",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleRetry = useCallback(
		async (generationId: string) => {
			try {
				const res = await fetch(`/api/generations/${generationId}/retry`, {
					method: "POST",
				});
				if (!res.ok) {
					throw new Error(`Retry failed with status ${res.status}`);
				}
				const data = (await res.json()) as { generation: MediaJobResult };
				await fetchGenerations();
				const generation = data.generation;
				if (generation.status === "queued" || generation.status === "running") {
					start(
						generation.id,
						generation.status === "running" ? "running" : "queued",
					);
				}
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Retry failed");
			}
		},
		[fetchGenerations, start],
	);

	return (
		<div className="flex flex-col gap-8">
			<form onSubmit={handleGenerate} className="flex flex-col gap-3">
				<label htmlFor="video-prompt" className="text-sm font-medium">
					Prompt
				</label>
				<Textarea
					id="video-prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Describe the video you want to generate (e.g. A drone shot flying over a pine forest at sunrise)..."
					className="min-h-24 resize-none"
					disabled={busy}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleGenerate(e);
						}
					}}
				/>
				<div className="flex flex-wrap items-center justify-between gap-3 pt-1">
					<span className="text-xs text-muted-foreground">
						Model: {selectedModel.name}
					</span>
					<Button
						type="submit"
						disabled={!prompt.trim() || busy}
						className="min-w-28"
					>
						{busy ? (
							<>
								<Loader2 className="size-4 mr-2 animate-spin" />
								Generating...
							</>
						) : (
							<>
								<Sparkles className="size-4 mr-1.5" />
								Generate
							</>
						)}
					</Button>
				</div>
			</form>

			{busy && (
				<Card
					className="p-4 bg-muted/40 border-primary/20 flex flex-col gap-2"
					data-slot="generating-card"
				>
					<div className="flex items-center gap-2 text-sm font-medium">
						<Loader2 className="size-4 animate-spin text-primary" />
						{stage ? STAGE_TEXT[stage] : "Waiting in the queue"}
					</div>
				</Card>
			)}

			{result?.outputUrl && (
				<Card className="p-4 flex flex-col gap-3" data-slot="media-result">
					<p className="text-sm font-medium">Latest video</p>
					{/* biome-ignore lint/a11y/useMediaCaption: generated video has no caption track */}
					<video
						controls
						src={result.outputUrl}
						aria-label="Generated video"
						className="w-full rounded-md bg-black"
					/>
				</Card>
			)}

			<MediaHistory
				category="video"
				generations={generations}
				loading={loadingHistory}
				onRefresh={fetchGenerations}
				onRetry={handleRetry}
				emptyModelName={selectedModel.name}
			/>
		</div>
	);
}
