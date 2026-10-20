"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { Category } from "@/lib/categories";

interface CapabilityGatingAlertProps {
	compatible: boolean;
	requiredModality: string;
	outputModalities: string[];
	category: Category;
	force: boolean;
	onForceChange: (force: boolean) => void;
}

export function CapabilityGatingAlert({
	compatible,
	requiredModality,
	outputModalities,
	category,
	force,
	onForceChange,
}: CapabilityGatingAlertProps) {
	return (
		<div
			className={`p-3 rounded-md text-xs border ${
				compatible
					? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
					: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
			}`}
		>
			<div className="font-semibold flex items-center gap-1.5 mb-1">
				{compatible ? (
					<>
						<CheckCircle2 className="size-3.5 text-emerald-500" />
						Capability Compatible
					</>
				) : (
					<>
						<AlertCircle className="size-3.5 text-amber-500" />
						Capability Warning
					</>
				)}
			</div>
			<p>
				Model outputs: [{outputModalities.join(", ") || "none"}]. Required for{" "}
				{category}: "{requiredModality}".
			</p>
			{!compatible && (
				<div className="mt-2 pt-2 border-t border-amber-500/20">
					<label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900 dark:text-amber-100">
						<input
							type="checkbox"
							checked={force}
							onChange={(e) => onForceChange(e.target.checked)}
							className="rounded"
						/>
						Force enable anyway (may fail at runtime)
					</label>
				</div>
			)}
		</div>
	);
}
