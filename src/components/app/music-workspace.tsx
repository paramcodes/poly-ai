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

export interface MusicWorkspaceProps {
	selectedModel: AssignedModel;
}

type MusicMode = "song" | "voice";

const STAGE_TEXT: Record<"queued" | "running", string> = {
	queued: "Waiting in the queue",
	running: "Rendering",
};

export function MusicWorkspace({ selectedModel }: MusicWorkspaceProps) {
	const [prompt, setPrompt] = useState("");
	const [mode, setMode] = useState<MusicMode>("song");
	const [submitting, setSubmitting] = useState(false);
	const [generations, setGenerations] = useState<MediaGenerationRecord[]>([]);
	const [loadingHistory, setLoadingHistory] = useState(true);
	const [result, setResult] = useState<MediaJobResult | null>(null);

	const fetchGenerations = useCallback(async () => {
		try {
			setLoadingHistory(true);
			const res = await fetch("/api/generations?category=music");
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
			toast.success(
				mode === "voice"
					? "Voice generated successfully!"
					: "Music generated successfully!",
			);
			fetchGenerations();
		},
		[fetchGenerations, mode],
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
			const res = await fetch("/api/generate/music", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: prompt.trim(),
					providerId: selectedModel.providerId,
					modelId: selectedModel.modelId,
					...(mode === "voice" ? { mode: "voice" } : {}),
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

			// Voice is text-to-speech: the route answers with a finished row.
			if (mode === "voice" || generation.status === "succeeded") {
				handleSuccess(generation);
				return;
			}
			start(
				generation.id,
				generation.status === "running" ? "running" : "queued",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Music generation failed",
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
				<div className="flex items-center gap-2">
					<fieldset
						aria-label="Generation mode"
						className="m-0 border-0 inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]"
					>
						<Button
							type="button"
							size="sm"
							variant={mode === "song" ? "default" : "ghost"}
							aria-pressed={mode === "song"}
							onClick={() => setMode("song")}
						>
							Song
						</Button>
						<Button
							type="button"
							size="sm"
							variant={mode === "voice" ? "default" : "ghost"}
							aria-pressed={mode === "voice"}
							onClick={() => setMode("voice")}
						>
							Voice
						</Button>
					</fieldset>
					<span className="text-xs text-muted-foreground">
						{mode === "voice"
							? "Text to speech, finished immediately"
							: "Full song, rendered in the background"}
					</span>
				</div>

				<label htmlFor="music-prompt" className="text-sm font-medium">
					Prompt
				</label>
				<Textarea
					id="music-prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder={
						mode === "voice"
							? "Enter the text to speak..."
							: "Describe the music you want to generate (e.g. A lo-fi hip hop beat with warm rhodes and vinyl crackle)..."
					}
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

			{busy && mode === "song" && (
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
					<p className="text-sm font-medium">
						Latest {mode === "voice" ? "voice" : "track"}
					</p>
					{/* biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track */}
					<audio
						controls
						src={result.outputUrl}
						aria-label="Generated audio"
						className="w-full"
					/>
				</Card>
			)}

			<MediaHistory
				category="music"
				generations={generations}
				loading={loadingHistory}
				onRefresh={fetchGenerations}
				onRetry={handleRetry}
				emptyModelName={selectedModel.name}
			/>
		</div>
	);
}
