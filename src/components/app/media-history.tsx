"use client";

import {
	Check,
	Clapperboard,
	Copy,
	Download,
	Music2,
	RefreshCw,
	RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type MediaJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface MediaGenerationRecord {
	id: string;
	category: string;
	modelId: string;
	prompt: string;
	status: MediaJobStatus;
	outputUrl?: string | null;
	error?: string | null;
	createdAt: string | Date;
}

export interface MediaJobResult {
	id: string;
	status: MediaJobStatus;
	outputUrl?: string | null;
	error?: string | null;
	prompt?: string | null;
	modelId?: string | null;
}

export interface MediaHistoryProps {
	category: "video" | "music";
	generations: MediaGenerationRecord[];
	loading: boolean;
	onRefresh: () => void;
	onRetry: (generationId: string) => void;
	emptyModelName: string;
}

const STATUS_VARIANT: Record<
	MediaJobStatus,
	"default" | "secondary" | "destructive" | "outline"
> = {
	queued: "secondary",
	running: "default",
	succeeded: "outline",
	failed: "destructive",
	cancelled: "secondary",
};

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function MediaHistory({
	category,
	generations,
	loading,
	onRefresh,
	onRetry,
	emptyModelName,
}: MediaHistoryProps) {
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const Icon = category === "video" ? Clapperboard : Music2;
	const noun = category === "video" ? "video" : "track";

	const handleCopyPrompt = async (text: string, id: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedId(id);
			toast.success("Prompt copied to clipboard");
			setTimeout(() => setCopiedId(null), 2000);
		} catch {
			toast.error("Failed to copy prompt");
		}
	};

	const handleDownload = (url: string, id: string) => {
		const a = document.createElement("a");
		a.href = url;
		a.download = `${category}-${id.slice(0, 8)}.${category === "video" ? "mp4" : "mp3"}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		toast.success("Download started");
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between pb-2 border-b">
				<div className="flex items-center gap-2">
					<Icon className="size-4 text-muted-foreground" />
					<h2 className="text-base font-semibold">History</h2>
					<Badge variant="secondary" className="text-xs">
						{generations.length}
					</Badge>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onRefresh}
					disabled={loading}
					className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
				>
					<RefreshCw
						className={`size-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
					/>
					Refresh
				</Button>
			</div>

			{generations.length === 0 ? (
				<div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center bg-muted/20">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted mb-3">
						<Icon className="size-6 text-muted-foreground" />
					</div>
					<h3 className="text-base font-semibold">Ready to generate</h3>
					<p className="text-sm text-muted-foreground max-w-sm mt-1">
						Type a prompt above and click Generate to create your first {noun}{" "}
						with {emptyModelName}.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{generations.map((gen) => (
						<Card
							key={gen.id}
							className="p-4 flex flex-col gap-3 border bg-card hover:border-primary/40 transition-colors"
						>
							<div className="flex flex-col gap-2">
								<p
									className="text-xs text-foreground line-clamp-2 leading-relaxed"
									title={gen.prompt}
								>
									{gen.prompt}
								</p>
								<div className="flex items-center gap-2">
									<Badge
										variant={STATUS_VARIANT[gen.status]}
										className="text-[10px] h-4 px-1 font-normal"
									>
										{gen.status}
									</Badge>
									<Badge
										variant="outline"
										className="text-[10px] h-4 px-1 font-normal"
									>
										{gen.modelId}
									</Badge>
								</div>
							</div>

							{gen.outputUrl &&
								(category === "video" ? (
									// biome-ignore lint/a11y/useMediaCaption: generated video has no caption track
									<video
										controls
										src={gen.outputUrl}
										aria-label={gen.prompt}
										className="w-full rounded-md bg-black"
									/>
								) : (
									// biome-ignore lint/a11y/useMediaCaption: generated audio has no caption track
									<audio
										controls
										src={gen.outputUrl}
										aria-label={gen.prompt}
										className="w-full"
									/>
								))}

							{gen.status === "failed" && gen.error && (
								<p className="text-xs text-destructive">{gen.error}</p>
							)}

							<div className="flex items-center gap-1 pt-1 border-t">
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
									onClick={() => handleCopyPrompt(gen.prompt, gen.id)}
								>
									{copiedId === gen.id ? (
										<Check className="size-3 text-green-500 mr-1" />
									) : (
										<Copy className="size-3 mr-1" />
									)}
									Copy
								</Button>
								{gen.outputUrl && (
									<Button
										variant="ghost"
										size="sm"
										className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
										onClick={() => handleDownload(gen.outputUrl ?? "", gen.id)}
									>
										<Download className="size-3 mr-1" />
										Download
									</Button>
								)}
								{gen.status === "failed" && (
									<Button
										variant="ghost"
										size="sm"
										className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
										onClick={() => onRetry(gen.id)}
									>
										<RotateCcw className="size-3 mr-1" />
										Retry
									</Button>
								)}
							</div>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

export interface UseMediaJobOptions {
	onSuccess: (generation: MediaJobResult) => void;
	onFailure: (message: string) => void;
}

export interface UseMediaJob {
	/** A job is queued or running. */
	running: boolean;
	/** "queued" or "running" — the last state the provider reported. */
	stage: "queued" | "running" | null;
	/** Start polling a job that the API accepted. */
	start: (generationId: string, initialStatus?: "queued" | "running") => void;
}

/**
 * Polls `GET /api/generations/{id}` until the job finishes. Shared by the
 * video and music workspaces.
 */
export function useMediaJob({
	onSuccess,
	onFailure,
}: UseMediaJobOptions): UseMediaJob {
	const [running, setRunning] = useState(false);
	const [stage, setStage] = useState<"queued" | "running" | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const successRef = useRef(onSuccess);
	const failureRef = useRef(onFailure);

	useEffect(() => {
		successRef.current = onSuccess;
		failureRef.current = onFailure;
	});

	useEffect(() => {
		if (!jobId) return;

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = Date.now() + POLL_TIMEOUT_MS;

		const finish = (
			generation: MediaJobResult | null,
			errorMessage: string | null,
		) => {
			if (cancelled) return;
			setRunning(false);
			if (errorMessage) failureRef.current(errorMessage);
			else if (generation) successRef.current(generation);
		};

		const tick = async () => {
			try {
				const res = await fetch(`/api/generations/${jobId}`);
				if (!res.ok) {
					throw new Error(`Could not load the job (${res.status})`);
				}
				const data = (await res.json()) as { generation: MediaJobResult };
				const generation = data.generation;

				if (generation.status === "succeeded") {
					finish(generation, null);
					return;
				}
				if (
					generation.status === "failed" ||
					generation.status === "cancelled"
				) {
					finish(null, generation.error ?? "The generation failed");
					return;
				}

				setStage(generation.status === "running" ? "running" : "queued");
				if (Date.now() >= deadline) {
					finish(null, "The generation timed out");
					return;
				}
				timer = setTimeout(tick, POLL_INTERVAL_MS);
			} catch (error) {
				finish(
					null,
					error instanceof Error ? error.message : "The generation failed",
				);
			}
		};

		timer = setTimeout(tick, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [jobId]);

	const start = useCallback(
		(generationId: string, initialStatus: "queued" | "running" = "queued") => {
			setRunning(true);
			setStage(initialStatus);
			setJobId(generationId);
		},
		[],
	);

	return { running, stage, start };
}
