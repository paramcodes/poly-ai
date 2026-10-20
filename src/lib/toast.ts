/**
 * Toast notification helpers for Poly-AI.
 *
 * Severity lives with the message in this module, never at the call site:
 * - Amber (toast.warning) means "not configured yet".
 * - Red (toast.error) means "attempt failed".
 *
 * See `docs/glossary.md` and `AGENTS.md`.
 */

import { toast } from "sonner";
import { CATEGORY_META, type Category } from "./categories";

export type CategoryEmptyReason = "not-configured" | "failed";

export function notifyCategoryEmpty(
	category: Category,
	reason: CategoryEmptyReason,
): string | number {
	const categoryName = CATEGORY_META[category]?.name ?? category;
	const id = `empty-category-${category}`;

	if (reason === "not-configured") {
		return toast.warning(`No active ${categoryName} models`, {
			id,
			description: `No active models are configured for ${categoryName}. Configure a provider in Settings to get started.`,
		});
	}

	return toast.error(`${categoryName} model verification failed`, {
		id,
		description: `Provider verification failed for ${categoryName} models. Check your provider settings in Settings.`,
	});
}
