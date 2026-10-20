"use client";

import { ExternalLink, Key, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProviderKind } from "@/lib/db/schema";
import type { CatalogueResponse, NormalizedProvider } from "@/server/catalogue";

interface AddProviderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	catalogue: CatalogueResponse | null;
	onSuccess: () => void;
}

export function AddProviderDialog({
	open,
	onOpenChange,
	catalogue,
	onSuccess,
}: AddProviderDialogProps) {
	const [addTab, setAddTab] = useState<"known" | "custom">("known");
	const [selectedKnownId, setSelectedKnownId] = useState("");
	const [customName, setCustomName] = useState("");
	const [customBaseUrl, setCustomBaseUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [adding, setAdding] = useState(false);

	const selectedCatalogueProvider: NormalizedProvider | undefined =
		catalogue?.providers.find((p) => p.id === selectedKnownId);

	async function handleAddProvider(e: React.FormEvent) {
		e.preventDefault();
		if (!apiKey.trim()) {
			toast.error("API key is required");
			return;
		}

		let name = "";
		let kind: ProviderKind = "openai-compatible";
		let baseUrl: string | null = null;

		if (addTab === "known") {
			if (!selectedCatalogueProvider) {
				toast.error("Please select a provider from the catalogue");
				return;
			}
			name = selectedCatalogueProvider.name;
			baseUrl = selectedCatalogueProvider.api ?? null;

			if (selectedCatalogueProvider.id === "openai") {
				kind = "openai";
			} else if (selectedCatalogueProvider.id === "anthropic") {
				kind = "anthropic";
			} else if (selectedCatalogueProvider.id === "google") {
				kind = "google";
			} else if (selectedCatalogueProvider.id === "fal") {
				kind = "fal";
			} else if (selectedCatalogueProvider.id === "replicate") {
				kind = "replicate";
			} else {
				kind = "openai-compatible";
			}
		} else {
			if (!customName.trim()) {
				toast.error("Provider display name is required");
				return;
			}
			if (!customBaseUrl.trim()) {
				toast.error(
					"Base URL is required for custom OpenAI-compatible endpoints",
				);
				return;
			}
			name = customName.trim();
			kind = "openai-compatible";
			baseUrl = customBaseUrl.trim();
		}

		setAdding(true);
		try {
			const res = await fetch("/api/providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, kind, apiKey: apiKey.trim(), baseUrl }),
			});
			const data = await res.json();

			if (!res.ok) {
				toast.error(data.error || "Failed to create provider");
				return;
			}

			if (data.probe?.ok) {
				toast.success(`Provider "${name}" added and verified successfully!`);
			} else {
				toast.warning(
					`Provider "${name}" added, but verification returned ${data.probe?.error || "an error"}. Marked as invalid.`,
				);
			}

			onOpenChange(false);
			setApiKey("");
			setCustomName("");
			setCustomBaseUrl("");
			setSelectedKnownId("");
			onSuccess();
		} catch {
			toast.error("Network error while adding provider");
		} finally {
			setAdding(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[540px]">
				<DialogHeader>
					<DialogTitle>Add API Provider</DialogTitle>
					<DialogDescription>
						Connect any AI vendor or custom OpenAI-compatible endpoint. Keys are
						stored encrypted and never leave the server.
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={addTab}
					onValueChange={(v) => setAddTab(v as "known" | "custom")}
				>
					<TabsList className="grid w-full grid-cols-2 mb-4">
						<TabsTrigger value="known">Catalogue Provider</TabsTrigger>
						<TabsTrigger value="custom">Custom Endpoint</TabsTrigger>
					</TabsList>

					<form onSubmit={handleAddProvider} className="space-y-4">
						<TabsContent value="known" className="space-y-4 m-0">
							<div className="space-y-2">
								<Label htmlFor="provider-select">Select Provider</Label>
								<select
									id="provider-select"
									className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
									value={selectedKnownId}
									onChange={(e) => setSelectedKnownId(e.target.value)}
								>
									<option value="">Choose a known provider...</option>
									{catalogue?.providers.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name} ({p.models.length} models)
										</option>
									))}
								</select>
							</div>

							{selectedCatalogueProvider && (
								<div className="rounded-md bg-muted/60 p-3 text-xs space-y-1">
									<div className="flex items-center justify-between">
										<span className="font-semibold text-foreground">
											{selectedCatalogueProvider.name}
										</span>
										{selectedCatalogueProvider.doc && (
											<a
												href={selectedCatalogueProvider.doc}
												target="_blank"
												rel="noreferrer"
												className="text-primary flex items-center gap-1 hover:underline"
											>
												Vendor Docs <ExternalLink className="size-3" />
											</a>
										)}
									</div>
									<div className="text-muted-foreground">
										Expected Env Key:{" "}
										<code className="text-foreground font-mono">
											{selectedCatalogueProvider.env.join(", ") || "API_KEY"}
										</code>
									</div>
									{selectedCatalogueProvider.api && (
										<div className="text-muted-foreground truncate">
											Base URL:{" "}
											<code className="text-foreground font-mono">
												{selectedCatalogueProvider.api}
											</code>
										</div>
									)}
								</div>
							)}
						</TabsContent>

						<TabsContent value="custom" className="space-y-4 m-0">
							<div className="space-y-2">
								<Label htmlFor="custom-name">Provider Name</Label>
								<Input
									id="custom-name"
									placeholder="e.g. Local vLLM, Ollama, Together"
									value={customName}
									onChange={(e) => setCustomName(e.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="custom-url">Base URL (OpenAI-compatible)</Label>
								<Input
									id="custom-url"
									placeholder="https://api.together.xyz/v1"
									value={customBaseUrl}
									onChange={(e) => setCustomBaseUrl(e.target.value)}
								/>
							</div>
						</TabsContent>

						<div className="space-y-2 pt-2">
							<Label htmlFor="api-key" className="flex items-center gap-1">
								<Key className="size-3.5" /> API Key
							</Label>
							<Input
								id="api-key"
								type="password"
								placeholder={
									selectedCatalogueProvider?.env[0]
										? `sk-... or ${selectedCatalogueProvider.env[0]}`
										: "sk-..."
								}
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
							/>
							<p className="text-[11px] text-muted-foreground">
								Key is tested immediately via probe and saved in an AES-256-GCM
								envelope.
							</p>
						</div>

						<DialogFooter className="pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={adding}>
								{adding ? (
									<>
										<Loader2 className="size-4 animate-spin mr-1" />
										Probing...
									</>
								) : (
									"Verify & Save"
								)}
							</Button>
						</DialogFooter>
					</form>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
