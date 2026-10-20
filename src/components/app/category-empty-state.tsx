"use client";

import { AlertCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyIllustration } from "@/components/app/empty-illustration";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { type CategoryEmptyReason, notifyCategoryEmpty } from "@/lib/toast";

export interface CategoryEmptyStateProps {
	category: Category;
	reason: CategoryEmptyReason;
}

export function CategoryEmptyState({
	category,
	reason,
}: CategoryEmptyStateProps) {
	useEffect(() => {
		notifyCategoryEmpty(category, reason);
	}, [category, reason]);

	const meta = CATEGORY_META[category];
	const categoryName = meta?.name ?? category;
	const isFailed = reason === "failed";

	return (
		<Card className="border-dashed" data-slot="category-empty-state">
			<CardHeader className="space-y-4">
				<div className="flex items-center gap-4">
					<EmptyIllustration kind={category} size="md" />
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							{isFailed ? (
								<AlertTriangle
									className="size-4 text-destructive shrink-0"
									aria-hidden="true"
								/>
							) : (
								<AlertCircle
									className="size-4 text-amber-500 shrink-0"
									aria-hidden="true"
								/>
							)}
							<CardTitle className="text-base font-semibold">
								{isFailed
									? "Provider verification failed"
									: `No models configured for ${categoryName}`}
							</CardTitle>
						</div>
						<CardDescription className="text-sm">
							{isFailed
								? `Provider verification failed for ${categoryName} models. Check your provider settings in Settings to restore access.`
								: `No active models are configured for ${categoryName}. Configure a provider and enable models in Settings to get started.`}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardFooter>
				<Button asChild>
					<Link href="/settings/providers">Configure Providers & Models</Link>
				</Button>
			</CardFooter>
		</Card>
	);
}
