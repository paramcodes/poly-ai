"use client";

import {
	Check,
	Copy,
	Download,
	ImageIcon,
	Maximize2,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface GenerationRecord {
	id: string;
	userId: string;
	category: string;
	providerId: string | null;
	modelId: string;
	prompt: string;
	status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
	outputUrl?: string | null;
	error?: string | null;
	metadata?: Record<string, unknown> | null;
	createdAt: string | Date;
}

export interface ImageGalleryProps {
	generations: GenerationRecord[];
	loading: boolean;
	onRefresh: () => void;
	emptyModelName: string;
}

export function ImageGallery({
	generations,
	loading,
	onRefresh,
	emptyModelName,
}: ImageGalleryProps) {
	const [activeLightbox, setActiveLightbox] = useState<GenerationRecord | null>(
		null,
	);
	const [copiedId, setCopiedId] = useState<string | null>(null);

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

	const handleDownloadImage = (url: string, id: string) => {
		const a = document.createElement("a");
		a.href = url;
		a.download = `image-${id.slice(0, 8)}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		toast.success("Image download started");
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between pb-2 border-b">
				<div className="flex items-center gap-2">
					<ImageIcon className="size-4 text-muted-foreground" />
					<h2 className="text-base font-semibold">Gallery</h2>
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
						<ImageIcon className="size-6 text-muted-foreground" />
					</div>
					<h3 className="text-base font-semibold">No images generated yet</h3>
					<p className="text-sm text-muted-foreground max-w-sm mt-1">
						Type a prompt above and click Generate to create your first image
						with {emptyModelName}.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
					{generations.map((gen) => (
						<Card
							key={gen.id}
							className="group overflow-hidden flex flex-col justify-between border bg-card hover:border-primary/40 transition-colors"
						>
							<div className="relative aspect-square bg-muted/50 overflow-hidden flex items-center justify-center">
								{gen.outputUrl ? (
									// biome-ignore lint/performance/noImgElement: dynamic user-generated data URLs and blob URLs
									<img
										src={gen.outputUrl}
										alt={gen.prompt}
										className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
									/>
								) : (
									<div className="flex flex-col items-center gap-1 text-muted-foreground">
										<ImageIcon className="size-6" />
										<span className="text-xs">{gen.status}</span>
									</div>
								)}

								{gen.outputUrl && (
									<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
										<Button
											size="icon"
											variant="secondary"
											className="size-8 rounded-full"
											onClick={() => setActiveLightbox(gen)}
											title="View full size"
										>
											<Maximize2 className="size-4" />
										</Button>
										<Button
											size="icon"
											variant="secondary"
											className="size-8 rounded-full"
											onClick={() =>
												handleDownloadImage(gen.outputUrl ?? "", gen.id)
											}
											title="Download image"
										>
											<Download className="size-4" />
										</Button>
									</div>
								)}
							</div>

							<div className="p-3 flex flex-col gap-2">
								<p
									className="text-xs text-foreground line-clamp-2 leading-relaxed"
									title={gen.prompt}
								>
									{gen.prompt}
								</p>
								<div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
									<Badge
										variant="outline"
										className="text-[10px] h-4 px-1 font-normal"
									>
										{gen.modelId}
									</Badge>
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
								</div>
							</div>
						</Card>
					))}
				</div>
			)}

			<Dialog
				open={!!activeLightbox}
				onOpenChange={(open) => !open && setActiveLightbox(null)}
			>
				{activeLightbox && (
					<DialogContent className="max-w-3xl flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle className="text-base font-semibold line-clamp-2">
								{activeLightbox.prompt}
							</DialogTitle>
							<DialogDescription className="text-xs text-muted-foreground flex items-center gap-2">
								<span>Model: {activeLightbox.modelId}</span>
								<span>•</span>
								<span>
									{new Date(activeLightbox.createdAt).toLocaleString()}
								</span>
							</DialogDescription>
						</DialogHeader>

						<div className="relative max-h-[60vh] w-full flex items-center justify-center rounded-lg overflow-hidden bg-black/5 dark:bg-black/20">
							{/* biome-ignore lint/performance/noImgElement: dynamic user-generated data URLs and blob URLs */}
							<img
								src={activeLightbox.outputUrl ?? ""}
								alt={activeLightbox.prompt}
								className="max-h-[60vh] w-auto object-contain rounded-md"
							/>
						</div>

						<div className="flex items-center justify-between pt-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									handleCopyPrompt(
										activeLightbox.prompt,
										`modal-${activeLightbox.id}`,
									)
								}
							>
								{copiedId === `modal-${activeLightbox.id}` ? (
									<Check className="size-4 mr-1.5 text-green-500" />
								) : (
									<Copy className="size-4 mr-1.5" />
								)}
								Copy Prompt
							</Button>

							<Button
								size="sm"
								onClick={() =>
									handleDownloadImage(
										activeLightbox.outputUrl ?? "",
										activeLightbox.id,
									)
								}
							>
								<Download className="size-4 mr-1.5" />
								Download Image
							</Button>
						</div>
					</DialogContent>
				)}
			</Dialog>
		</div>
	);
}
