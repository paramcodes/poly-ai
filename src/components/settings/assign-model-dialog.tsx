"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CapabilityGatingAlert } from "@/components/settings/capability-gating-alert";
import type { UserProvider } from "@/components/settings/providers-table";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { evaluateCapabilityGating } from "@/lib/capabilities";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { CatalogueResponse, NormalizedModel } from "@/server/catalogue";

interface AssignModelDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	providers: UserProvider[];
	catalogue: CatalogueResponse | null;
	onSuccess: () => void;
}

export function AssignModelDialog({
	open,
	onOpenChange,
	providers,
	catalogue,
	onSuccess,
}: AssignModelDialogProps) {
	const [assignProviderId, setAssignProviderId] = useState("");
	const [assignModelId, setAssignModelId] = useState("");
	const [assignCategory, setAssignCategory] = useState<Category>("text");
	const [assignForce, setAssignForce] = useState(false);
	const [assigning, setAssigning] = useState(false);

	const activeAssignProvider = providers.find((p) => p.id === assignProviderId);
	const matchedCatalogueProvider = catalogue?.providers.find(
		(p) =>
			p.name.toLowerCase() === activeAssignProvider?.name.toLowerCase() ||
			p.id === activeAssignProvider?.kind,
	);
	const availableModels: NormalizedModel[] =
		matchedCatalogueProvider?.models || [];
	const selectedModelForAssign: NormalizedModel | undefined =
		availableModels.find((m) => m.id === assignModelId);

	const modelOutputModalities = selectedModelForAssign?.modalities?.output || [
		"text",
	];
	const gating = evaluateCapabilityGating(
		modelOutputModalities,
		assignCategory,
	);

	async function handleAssignModel(e: React.FormEvent) {
		e.preventDefault();
		if (!assignProviderId || !assignModelId) {
			toast.error("Please select a provider and a model");
			return;
		}

		if (!gating.compatible && !assignForce) {
			toast.error(gating.warning || "Model lacks required capability");
			return;
		}

		setAssigning(true);
		try {
			const modelName = selectedModelForAssign?.name || assignModelId;
			const res = await fetch("/api/models", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providerId: assignProviderId,
					modelId: assignModelId,
					name: modelName,
					category: assignCategory,
					capabilities: modelOutputModalities,
					force: assignForce,
				}),
			});

			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error || "Failed to assign model");
				return;
			}

			toast.success(
				`Model "${modelName}" assigned to "${assignCategory}" category`,
			);
			onOpenChange(false);
			setAssignModelId("");
			setAssignForce(false);
			onSuccess();
		} catch {
			toast.error("Network error assigning model");
		} finally {
			setAssigning(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Assign Model to Category</DialogTitle>
					<DialogDescription>
						Select a provider and model. The capability gating engine will
						verify compatibility with the chosen category.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleAssignModel} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="assign-provider">Provider</Label>
						<select
							id="assign-provider"
							className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
							value={assignProviderId}
							onChange={(e) => {
								setAssignProviderId(e.target.value);
								setAssignModelId("");
							}}
						>
							<option value="">Select a configured provider...</option>
							{providers.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name} ({p.status})
								</option>
							))}
						</select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="assign-model">Model</Label>
						<select
							id="assign-model"
							className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
							value={assignModelId}
							disabled={!assignProviderId}
							onChange={(e) => setAssignModelId(e.target.value)}
						>
							<option value="">Choose a model...</option>
							{availableModels.map((m) => (
								<option key={m.id} value={m.id}>
									{m.name} ({m.modalities.output.join(", ")})
								</option>
							))}
						</select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="assign-category">Target Category</Label>
						<select
							id="assign-category"
							className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
							value={assignCategory}
							onChange={(e) => setAssignCategory(e.target.value as Category)}
						>
							{CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat.charAt(0).toUpperCase() + cat.slice(1)}
								</option>
							))}
						</select>
					</div>

					{assignModelId && (
						<CapabilityGatingAlert
							compatible={gating.compatible}
							requiredModality={gating.requiredModality}
							outputModalities={modelOutputModalities}
							category={assignCategory}
							force={assignForce}
							onForceChange={setAssignForce}
						/>
					)}

					<DialogFooter className="pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								assigning ||
								!assignModelId ||
								(!gating.compatible && !assignForce)
							}
						>
							{assigning ? (
								<>
									<Loader2 className="size-4 animate-spin mr-1" />
									Assigning...
								</>
							) : (
								"Assign Model"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
