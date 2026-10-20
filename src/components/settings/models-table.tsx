"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { Category } from "@/lib/categories";
import type { ProviderStatus } from "@/lib/db/schema";

export interface AssignedModel {
	id: string;
	providerId: string;
	providerName: string;
	providerStatus: ProviderStatus;
	modelId: string;
	name: string;
	category: Category;
	capabilities: string[];
	enabled: string;
}

interface ModelsTableProps {
	models: AssignedModel[];
	onToggle: (id: string, currentEnabled: string) => void;
	onDelete: (id: string, name: string) => void;
}

export function ModelsTable({ models, onToggle, onDelete }: ModelsTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Model</TableHead>
					<TableHead>Provider</TableHead>
					<TableHead>Category</TableHead>
					<TableHead>Capabilities</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{models.map((m) => (
					<TableRow key={m.id}>
						<TableCell>
							<div className="font-medium text-sm">{m.name}</div>
							<div className="text-xs text-muted-foreground font-mono">
								{m.modelId}
							</div>
						</TableCell>
						<TableCell className="text-sm text-muted-foreground">
							{m.providerName}
						</TableCell>
						<TableCell>
							<Badge variant="outline" className="capitalize">
								{m.category}
							</Badge>
						</TableCell>
						<TableCell>
							<div className="flex gap-1 flex-wrap max-w-xs">
								{m.capabilities.map((c) => (
									<span
										key={c}
										className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono"
									>
										{c}
									</span>
								))}
							</div>
						</TableCell>
						<TableCell>
							<Button
								size="sm"
								variant={m.enabled === "true" ? "default" : "secondary"}
								className="h-6 text-xs px-2"
								onClick={() => onToggle(m.id, m.enabled)}
							>
								{m.enabled === "true" ? "Enabled" : "Disabled"}
							</Button>
						</TableCell>
						<TableCell className="text-right">
							<Button
								size="sm"
								variant="ghost"
								className="size-8 p-0 text-destructive hover:text-destructive"
								title="Remove model assignment"
								onClick={() => onDelete(m.id, m.name)}
							>
								<Trash2 className="size-3.5" />
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
