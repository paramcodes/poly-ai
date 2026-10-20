import { cn } from "cn";
import {
	Clapperboard,
	Code2,
	ImageIcon,
	Key,
	Keyboard,
	Music2,
	Sparkles,
	Type,
} from "lucide-react";
import type * as React from "react";
import type { Category } from "@/lib/categories";

export type IllustrationKind = Category | "provider" | "shortcuts";

interface EmptyIllustrationProps extends React.ComponentProps<"div"> {
	kind: IllustrationKind;
	size?: "sm" | "md" | "lg";
}

const KIND_ICONS: Record<
	IllustrationKind,
	React.ComponentType<{ className?: string }>
> = {
	text: Type,
	image: ImageIcon,
	video: Clapperboard,
	music: Music2,
	website: Code2,
	provider: Key,
	shortcuts: Keyboard,
};

export function EmptyIllustration({
	kind,
	size = "md",
	className,
	...props
}: EmptyIllustrationProps) {
	const Icon = KIND_ICONS[kind] ?? Sparkles;

	const dimensions = {
		sm: "size-10",
		md: "size-14",
		lg: "size-20",
	}[size];

	const iconSize = {
		sm: "size-5",
		md: "size-7",
		lg: "size-10",
	}[size];

	return (
		<div
			data-slot="empty-illustration"
			data-kind={kind}
			className={cn(
				"relative flex items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/40 text-muted-foreground",
				dimensions,
				className,
			)}
			{...props}
		>
			<div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-b from-brand/5 to-transparent blur-xs pointer-events-none" />
			<Icon className={cn("text-muted-foreground/80", iconSize)} />
			<div className="absolute -top-1 -right-1 flex size-3 items-center justify-center">
				<span className="size-1.5 rounded-full bg-brand/40" />
			</div>
		</div>
	);
}
