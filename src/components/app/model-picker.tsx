"use client";

import type { AssignedModel } from "@/components/settings/models-table";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export interface ModelPickerProps {
	models: AssignedModel[];
	selectedModelId: string | null;
	onSelectModel: (modelId: string) => void;
	disabled?: boolean;
}

export function ModelPicker({
	models,
	selectedModelId,
	onSelectModel,
	disabled = false,
}: ModelPickerProps) {
	const hasModels = models.length > 0;
	const selectedModel = models.find((m) => m.id === selectedModelId);

	return (
		<Select
			value={selectedModelId ?? undefined}
			onValueChange={onSelectModel}
			disabled={disabled || !hasModels}
		>
			<SelectTrigger
				className="w-full sm:w-[260px] md:w-[300px]"
				aria-label="Select model"
				data-slot="model-picker-trigger"
			>
				<SelectValue
					placeholder={hasModels ? "Select a model" : "No models available"}
				>
					{selectedModel ? (
						<span className="flex items-center gap-2 truncate">
							<span className="truncate">{selectedModel.name}</span>
							<Badge
								variant="outline"
								className="text-[10px] px-1.5 py-0 h-4 font-mono shrink-0"
							>
								{selectedModel.providerName}
							</Badge>
						</span>
					) : undefined}
				</SelectValue>
			</SelectTrigger>
			{hasModels ? (
				<SelectContent data-slot="model-picker-content">
					{models.map((model) => (
						<SelectItem key={model.id} value={model.id}>
							<div className="flex items-center justify-between gap-2 w-full">
								<span className="truncate">{model.name}</span>
								<Badge
									variant="outline"
									className="text-[10px] px-1.5 py-0 h-4 font-mono shrink-0 ml-auto"
								>
									{model.providerName}
								</Badge>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			) : null}
		</Select>
	);
}

export type { AssignedModel };
