"use client";

import { AlertCircle, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
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
import type { ProviderKind, ProviderStatus } from "@/lib/db/schema";

export interface UserProvider {
	id: string;
	name: string;
	kind: ProviderKind;
	status: ProviderStatus;
	baseUrl: string | null;
	apiKeyHint: string;
	createdAt: string;
}

interface ProvidersTableProps {
	providers: UserProvider[];
	verifyingId: string | null;
	onVerify: (id: string) => void;
	onDelete: (id: string, name: string) => void;
}

export function ProvidersTable({
	providers,
	verifyingId,
	onVerify,
	onDelete,
}: ProvidersTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Provider</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Kind</TableHead>
					<TableHead>Key Hint</TableHead>
					<TableHead>Base URL</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{providers.map((p) => (
					<TableRow key={p.id}>
						<TableCell className="font-medium">{p.name}</TableCell>
						<TableCell>
							{p.status === "active" ? (
								<Badge
									variant="default"
									className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
								>
									<CheckCircle2 className="size-3" /> Active
								</Badge>
							) : p.status === "invalid" ? (
								<Badge variant="destructive" className="gap-1">
									<AlertCircle className="size-3" /> Invalid
								</Badge>
							) : (
								<Badge variant="secondary">{p.status}</Badge>
							)}
						</TableCell>
						<TableCell className="text-xs text-muted-foreground font-mono">
							{p.kind}
						</TableCell>
						<TableCell className="text-xs font-mono">{p.apiKeyHint}</TableCell>
						<TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
							{p.baseUrl || "Default SDK"}
						</TableCell>
						<TableCell className="text-right space-x-1">
							<Button
								size="sm"
								variant="ghost"
								className="size-8 p-0"
								title="Re-verify credentials"
								disabled={verifyingId === p.id}
								onClick={() => onVerify(p.id)}
							>
								<RefreshCw
									className={`size-3.5 ${
										verifyingId === p.id
											? "animate-spin motion-reduce:animate-none"
											: ""
									}`}
								/>
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="size-8 p-0 text-destructive hover:text-destructive"
								title="Delete provider"
								onClick={() => onDelete(p.id, p.name)}
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
