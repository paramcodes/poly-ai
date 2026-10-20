"use client";

import { ChevronRight, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyIllustration } from "@/components/app/empty-illustration";
import { AddProviderDialog } from "@/components/settings/add-provider-dialog";
import { AssignModelDialog } from "@/components/settings/assign-model-dialog";
import {
	type AssignedModel,
	ModelsTable,
} from "@/components/settings/models-table";
import {
	ProvidersTable,
	type UserProvider,
} from "@/components/settings/providers-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogueResponse } from "@/server/catalogue";

export function ProvidersSettingsView() {
	const [providers, setProviders] = useState<UserProvider[]>([]);
	const [models, setModels] = useState<AssignedModel[]>([]);
	const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
	const [loading, setLoading] = useState(true);

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isAssignOpen, setIsAssignOpen] = useState(false);
	const [verifyingId, setVerifyingId] = useState<string | null>(null);

	const fetchAll = useCallback(async () => {
		try {
			const [provRes, modelsRes, catRes] = await Promise.all([
				fetch("/api/providers").then(async (r) => (r.ok ? r.json() : {})),
				fetch("/api/models").then(async (r) => (r.ok ? r.json() : {})),
				fetch("/api/catalog").then(async (r) => (r.ok ? r.json() : {})),
			]);

			if (provRes.providers) setProviders(provRes.providers);
			if (modelsRes.models) setModels(modelsRes.models);
			if (catRes.providers) setCatalogue(catRes);
		} catch (err) {
			console.error(err);
			toast.error("Failed to load providers or catalogue data");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAll();
	}, [fetchAll]);

	async function handleVerify(providerId: string) {
		setVerifyingId(providerId);
		try {
			const res = await fetch(`/api/providers/${providerId}`, {
				method: "POST",
			});
			const data = await res.json();

			if (!res.ok) {
				toast.error(data.error || "Verification probe failed");
				return;
			}

			if (data.probe?.ok) {
				toast.success("Provider credentials verified active!");
			} else {
				toast.error(
					`Verification failed: ${data.probe?.error || "Invalid response"}`,
				);
			}
			fetchAll();
		} catch {
			toast.error("Network error running verification probe");
		} finally {
			setVerifyingId(null);
		}
	}

	async function handleDeleteProvider(providerId: string, name: string) {
		if (
			!confirm(
				`Delete provider "${name}"? All assigned models from this provider will be removed.`,
			)
		) {
			return;
		}

		try {
			const res = await fetch(`/api/providers/${providerId}`, {
				method: "DELETE",
			});
			if (res.ok) {
				toast.success(`Provider "${name}" deleted`);
				fetchAll();
			} else {
				toast.error("Failed to delete provider");
			}
		} catch {
			toast.error("Network error deleting provider");
		}
	}

	async function handleToggleModel(modelId: string, currentEnabled: string) {
		const next = currentEnabled !== "true";
		try {
			const res = await fetch("/api/models", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: modelId, enabled: next }),
			});
			if (res.ok) {
				setModels((prev) =>
					prev.map((m) =>
						m.id === modelId ? { ...m, enabled: next ? "true" : "false" } : m,
					),
				);
				toast.success(next ? "Model enabled" : "Model disabled");
			} else {
				toast.error("Failed to toggle model");
			}
		} catch {
			toast.error("Network error toggling model");
		}
	}

	async function handleDeleteModel(modelId: string, name: string) {
		try {
			const res = await fetch(`/api/models?id=${modelId}`, {
				method: "DELETE",
			});
			if (res.ok) {
				toast.success(`Removed model "${name}"`);
				setModels((prev) => prev.filter((m) => m.id !== modelId));
			} else {
				toast.error("Failed to remove model");
			}
		} catch {
			toast.error("Network error removing model");
		}
	}

	return (
		<div className="container max-w-5xl py-8 space-y-10">
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Link href="/app/text" className="hover:text-foreground">
						Studio
					</Link>
					<ChevronRight className="size-4" />
					<span className="text-foreground">Settings</span>
					<ChevronRight className="size-4" />
					<span className="text-foreground font-medium">
						Providers & Models
					</span>
				</div>
				<div className="flex items-center justify-between mt-2">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">
							Providers & Models
						</h1>
						<p className="text-muted-foreground text-sm mt-1">
							Bring your own API keys. Encrypted with AES-256-GCM at rest,
							verified live, and mapped into your generation studio.
						</p>
					</div>

					<Button className="gap-2" onClick={() => setIsAddOpen(true)}>
						<Plus className="size-4" /> Add Provider
					</Button>
				</div>
			</div>

			<AddProviderDialog
				open={isAddOpen}
				onOpenChange={setIsAddOpen}
				catalogue={catalogue}
				onSuccess={fetchAll}
			/>

			<AssignModelDialog
				open={isAssignOpen}
				onOpenChange={setIsAssignOpen}
				providers={providers}
				catalogue={catalogue}
				onSuccess={fetchAll}
			/>

			{/* Providers Section */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between pb-3">
					<div>
						<CardTitle className="text-lg">Configured Providers</CardTitle>
						<CardDescription>
							Your registered vendor connections and credential health status.
						</CardDescription>
					</div>
					<Badge variant="outline" className="font-mono text-xs">
						{providers.length} registered
					</Badge>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="space-y-3 p-2" data-slot="providers-skeleton">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : providers.length === 0 ? (
						<div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg bg-muted/10">
							<EmptyIllustration kind="provider" size="md" className="mb-3" />
							<p className="text-sm font-medium">No providers added yet</p>
							<p className="text-xs text-muted-foreground mt-1 max-w-sm">
								Click "Add Provider" above to connect your OpenAI, Anthropic,
								Google, or any OpenAI-compatible key.
							</p>
						</div>
					) : (
						<ProvidersTable
							providers={providers}
							verifyingId={verifyingId}
							onVerify={handleVerify}
							onDelete={handleDeleteProvider}
						/>
					)}
				</CardContent>
			</Card>

			{/* Models & Capability Gating Section */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between pb-3">
					<div>
						<CardTitle className="text-lg">Model Assignment Table</CardTitle>
						<CardDescription>
							Assign models to studio categories with capability gating from
							models.dev metadata.
						</CardDescription>
					</div>

					<Button
						variant="outline"
						size="sm"
						className="gap-2"
						disabled={providers.length === 0}
						onClick={() => setIsAssignOpen(true)}
					>
						<Sparkles className="size-4" /> Assign Model
					</Button>
				</CardHeader>
				<CardContent>
					{models.length === 0 ? (
						<div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg">
							<Sparkles className="size-8 text-muted-foreground/60 mb-2" />
							<p className="text-sm font-medium">No models assigned yet</p>
							<p className="text-xs text-muted-foreground mt-1 max-w-sm">
								Assign configured provider models to studio categories above.
							</p>
						</div>
					) : (
						<ModelsTable
							models={models}
							onToggle={handleToggleModel}
							onDelete={handleDeleteModel}
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
