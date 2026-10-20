"use client";

import { Loader2, Sparkles } from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	type GenerationRecord,
	ImageGallery,
} from "@/components/app/image-gallery";
import type { AssignedModel } from "@/components/settings/models-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseSSEStream } from "@/lib/generation/events";

export type { GenerationRecord };

export interface ImageWorkspaceProps {
	selectedModel: AssignedModel;
	initialGenerations?: GenerationRecord[];
}

const ASPECT_RATIOS = [
	{ value: "1:1", label: "1:1 Square" },
	{ value: "16:9", label: "16:9 Landscape" },
	{ value: "9:16", label: "9:16 Portrait" },
	{ value: "4:3", label: "4:3 Standard" },
	{ value: "3:4", label: "3:4 Vertical" },
];

export function ImageWorkspace({
	selectedModel,
	initialGenerations,
}: ImageWorkspaceProps) {
	const [prompt, setPrompt] = useState("");
	const [aspectRatio, setAspectRatio] = useState("1:1");
	const [generating, setGenerating] = useState(false);
	const [progressStage, setProgressStage] = useState<string | null>(null);
	const [progressPercent, setProgressPercent] = useState<number>(0);
	const [generations, setGenerations] = useState<GenerationRecord[]>(
		initialGenerations ?? [],
	);
	const [loadingHistory, setLoadingHistory] = useState(
		initialGenerations === undefined,
	);

	const fetchGenerations = useCallback(async () => {
		try {
			setLoadingHistory(true);
			const res = await fetch("/api/generations?category=image");
			if (!res.ok) return;
			const data = (await res.json()) as { generations: GenerationRecord[] };
			setGenerations(data.generations || []);
		} catch {
			// Non-blocking history load
		} finally {
			setLoadingHistory(false);
		}
	}, []);

	useEffect(() => {
		if (initialGenerations === undefined) {
			fetchGenerations();
		}
	}, [fetchGenerations, initialGenerations]);

	const handleGenerate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || generating) return;

		setGenerating(true);
		setProgressStage("Queued");
		setProgressPercent(10);

		try {
			const res = await fetch("/api/generate/image", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: prompt.trim(),
					providerId: selectedModel.providerId,
					modelId: selectedModel.modelId,
					aspectRatio,
				}),
			});

			if (!res.ok) {
				const errJson = await res.json().catch(() => ({}));
				throw new Error(
					errJson.error || `Generation failed with status ${res.status}`,
				);
			}

			if (!res.body) {
				throw new Error("Missing response stream");
			}

			for await (const event of parseSSEStream(res.body)) {
				if (event.type === "queued") {
					setProgressStage("Queued in queue");
					setProgressPercent(15);
				} else if (event.type === "progress") {
					setProgressStage(event.message || "Generating image...");
					setProgressPercent(event.progress);
				} else if (event.type === "complete") {
					setProgressStage("Completed");
					setProgressPercent(100);
					toast.success("Image generated successfully!");
					fetchGenerations();
					setPrompt("");
					break;
				} else if (event.type === "error") {
					throw new Error(event.error);
				}
			}
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : "Image generation failed";
			toast.error(msg);
		} finally {
			setGenerating(false);
			setProgressStage(null);
			setProgressPercent(0);
		}
	};

	return (
		<div className="flex flex-col gap-8">
			<form onSubmit={handleGenerate} className="flex flex-col gap-3">
				<label htmlFor="image-prompt" className="text-sm font-medium">
					Prompt
				</label>
				<Textarea
					id="image-prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Describe the image you want to generate (e.g. A serene mountain lake at sunrise with photorealistic mist)..."
					className="min-h-24 resize-none"
					disabled={generating}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleGenerate(e);
						}
					}}
				/>
				<div className="flex flex-wrap items-center justify-between gap-3 pt-1">
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground font-medium">
							Aspect Ratio:
						</span>
						<Select
							value={aspectRatio}
							onValueChange={setAspectRatio}
							disabled={generating}
						>
							<SelectTrigger className="w-[140px] h-8 text-xs">
								<SelectValue placeholder="Ratio" />
							</SelectTrigger>
							<SelectContent>
								{ASPECT_RATIOS.map((ratio) => (
									<SelectItem key={ratio.value} value={ratio.value}>
										{ratio.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<Button
						type="submit"
						disabled={!prompt.trim() || generating}
						className="min-w-28"
					>
						{generating ? (
							<>
								<Loader2 className="size-4 mr-2 animate-spin motion-reduce:animate-none" />
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

			{generating && (
				<Card
					className="p-4 bg-muted/40 border-primary/20 flex flex-col gap-2"
					data-slot="generating-card"
				>
					<div className="flex items-center justify-between text-sm">
						<span className="font-medium flex items-center gap-2">
							<Loader2 className="size-4 animate-spin motion-reduce:animate-none text-primary" />
							{progressStage || "Generating image..."}
						</span>
						<span className="text-xs text-muted-foreground">
							{progressPercent}%
						</span>
					</div>
					<div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
						<div
							className="bg-primary h-full transition-all duration-300 motion-reduce:transition-none"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
				</Card>
			)}

			<ImageGallery
				generations={generations}
				loading={loadingHistory}
				onRefresh={fetchGenerations}
				emptyModelName={selectedModel.name}
			/>
		</div>
	);
}
