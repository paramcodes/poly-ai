"use client";

import { Keyboard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export interface ShortcutItem {
	keys: string[];
	description: string;
	scope: string;
}

export const SHORTCUTS: ShortcutItem[] = [
	{ keys: ["⌘", "B"], description: "Toggle sidebar", scope: "Global" },
	{ keys: ["?"], description: "Open shortcuts cheat-sheet", scope: "Global" },
	{ keys: ["Esc"], description: "Close dialog or lightbox", scope: "Global" },
	{
		keys: ["Enter"],
		description: "Send prompt and stream",
		scope: "Text / Website",
	},
	{
		keys: ["Shift", "Enter"],
		description: "Insert new line",
		scope: "Text / Website",
	},
	{
		keys: ["⌘", "Enter"],
		description: "Submit generation job",
		scope: "Media",
	},
];

export function ShortcutsDialog({ trigger }: { trigger?: React.ReactNode }) {
	const [open, setOpen] = useState(false);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		// Ignore if user is currently typing in an input, textarea, or contentEditable element
		const target = e.target as HTMLElement | null;
		if (
			target &&
			(target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable)
		) {
			return;
		}

		if (e.key === "?" || (e.key === "/" && (e.metaKey || e.ctrlKey))) {
			e.preventDefault();
			setOpen((prev) => !prev);
		}
	}, []);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button
						variant="ghost"
						size="sm"
						className="size-8 p-0 text-muted-foreground hover:text-foreground"
						title="Keyboard shortcuts (?)"
						aria-label="Keyboard shortcuts"
					>
						<Keyboard className="size-4" />
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Keyboard className="size-4 text-primary" />
						Keyboard Shortcuts
					</DialogTitle>
					<DialogDescription>
						Quick navigation and actions available across Poly-AI studios.
					</DialogDescription>
				</DialogHeader>
				<div className="divide-y divide-border/60 text-xs">
					{SHORTCUTS.map((shortcut) => (
						<div
							key={shortcut.description}
							className="flex items-center justify-between py-2.5"
						>
							<div className="flex flex-col gap-0.5">
								<span className="font-medium text-foreground">
									{shortcut.description}
								</span>
								<span className="text-[10px] text-muted-foreground">
									{shortcut.scope}
								</span>
							</div>
							<div className="flex items-center gap-1">
								{shortcut.keys.map((k) => (
									<kbd
										key={k}
										className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground shadow-xs"
									>
										{k}
									</kbd>
								))}
							</div>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
