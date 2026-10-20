"use client";

import {
	Clapperboard,
	Code2,
	ImageIcon,
	Music2,
	Sparkles,
	Type,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryEmptyState } from "@/components/app/category-empty-state";
import { ImageWorkspace } from "@/components/app/image-workspace";
import { ModelPicker } from "@/components/app/model-picker";
import { TextWorkspace } from "@/components/app/text-workspace";
import { WebsiteWorkspace } from "@/components/app/website-workspace";
import type { AssignedModel } from "@/components/settings/models-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_META, type Category } from "@/lib/categories";

const CATEGORY_ICONS: Record<
	Category,
	React.ComponentType<{ className?: string }>
> = {
	text: Type,
	image: ImageIcon,
	video: Clapperboard,
	music: Music2,
	website: Code2,
};

export interface CategoryViewProps {
	category: Category;
	initialModels?: AssignedModel[];
}

export function CategoryView({ category, initialModels }: CategoryViewProps) {
	const [models, setModels] = useState<AssignedModel[]>(initialModels ?? []);
	const [loading, setLoading] = useState(initialModels === undefined);
	const [error, setError] = useState<string | null>(null);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

	const meta = CATEGORY_META[category];
	const Icon = CATEGORY_ICONS[category] ?? Sparkles;

	const fetchModels = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/models?category=${category}`);
			if (!res.ok) {
				if (res.status === 401) {
					setModels([]);
					return;
				}
				throw new Error(`Failed to load models (${res.status})`);
			}
			const data = (await res.json()) as { models?: AssignedModel[] };
			setModels(data.models || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load models");
		} finally {
			setLoading(false);
		}
	}, [category]);

	useEffect(() => {
		if (initialModels === undefined) {
			fetchModels();
		}
		setSelectedModelId(null);
	}, [fetchModels, initialModels]);

	const activeModels = useMemo(
		() =>
			models.filter(
				(m) =>
					(m.enabled === "true" || (m.enabled as unknown) === true) &&
					m.providerStatus === "active",
			),
		[models],
	);

	const effectiveSelectedModelId = useMemo(() => {
		if (selectedModelId && activeModels.some((m) => m.id === selectedModelId)) {
			return selectedModelId;
		}
		return activeModels[0]?.id ?? null;
	}, [selectedModelId, activeModels]);
	const selectedModel = useMemo(() => {
		return (
			activeModels.find((m) => m.id === effectiveSelectedModelId) ??
			activeModels[0] ??
			null
		);
	}, [activeModels, effectiveSelectedModelId]);

	if (loading) {
		return (
			<div className="flex flex-col gap-6" data-slot="category-skeleton">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b">
					<div className="space-y-2">
						<Skeleton className="h-8 w-36" />
						<Skeleton className="h-4 w-72" />
					</div>
					<Skeleton className="h-8 w-full sm:w-[260px] md:w-[300px]" />
				</div>

				<div className="flex flex-col gap-6 pt-6">
					<div className="space-y-3">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-24 w-full" />
						<div className="flex justify-end">
							<Skeleton className="h-8 w-24" />
						</div>
					</div>
					<Skeleton className="h-64 w-full rounded-xl" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-6">
				<div className="space-y-1 pb-6 border-b">
					<div className="flex items-center gap-2">
						<Icon className="size-5 text-muted-foreground" />
						<h1 className="text-2xl font-bold tracking-tight">{meta.name}</h1>
					</div>
					<p className="text-sm text-muted-foreground">{meta.description}</p>
				</div>

				<div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
					<h3 className="font-semibold text-destructive mb-1">
						Failed to load models
					</h3>
					<p className="text-sm text-muted-foreground mb-4">{error}</p>
					<Button variant="outline" size="sm" onClick={fetchModels}>
						Try again
					</Button>
				</div>
			</div>
		);
	}

	if (activeModels.length === 0) {
		const hasInvalidProvider = models.some(
			(m) => m.providerStatus === "invalid",
		);
		const reason = hasInvalidProvider ? "failed" : "not-configured";

		return (
			<div className="flex flex-col gap-6">
				<div className="space-y-1 pb-6 border-b">
					<div className="flex items-center gap-2">
						<Icon className="size-5 text-muted-foreground" />
						<h1 className="text-2xl font-bold tracking-tight">{meta.name}</h1>
					</div>
					<p className="text-sm text-muted-foreground">{meta.description}</p>
				</div>

				<CategoryEmptyState category={category} reason={reason} />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Icon className="size-5 text-muted-foreground" />
						<h1 className="text-2xl font-bold tracking-tight">{meta.name}</h1>
					</div>
					<p className="text-sm text-muted-foreground">{meta.description}</p>
				</div>
				<ModelPicker
					models={activeModels}
					selectedModelId={effectiveSelectedModelId}
					onSelectModel={setSelectedModelId}
				/>
			</div>

			{category === "text" && selectedModel ? (
				<TextWorkspace selectedModel={selectedModel} />
			) : category === "website" && selectedModel ? (
				<WebsiteWorkspace selectedModel={selectedModel} />
			) : category === "image" && selectedModel ? (
				<ImageWorkspace selectedModel={selectedModel} />
			) : (
				<div className="flex flex-col gap-6">
					<div className="flex flex-col gap-3">
						<label htmlFor="prompt-input" className="text-sm font-medium">
							Prompt
						</label>
						<Textarea
							id="prompt-input"
							placeholder={`Enter a prompt for ${meta.name.toLowerCase()} generation...`}
							className="min-h-24 resize-none"
						/>
						<div className="flex justify-end">
							<Button disabled={!effectiveSelectedModelId}>
								<Sparkles className="size-4 mr-1.5" />
								Generate
							</Button>
						</div>
					</div>

					<div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center bg-muted/20">
						<div className="flex size-12 items-center justify-center rounded-full bg-muted mb-3">
							<Icon className="size-6 text-muted-foreground" />
						</div>
						<h3 className="text-base font-semibold">Ready to generate</h3>
						<p className="text-sm text-muted-foreground max-w-sm mt-1">
							Enter a prompt and select a model to create{" "}
							{meta.name.toLowerCase()} content.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
