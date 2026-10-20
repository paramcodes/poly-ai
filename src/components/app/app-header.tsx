"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CATEGORY_META, isCategory } from "@/lib/categories";

export function AppHeader() {
	const pathname = usePathname() || "";
	const segments = pathname.split("/").filter(Boolean);

	let title = "Dashboard";
	if (segments[0] === "app" && segments[1] && isCategory(segments[1])) {
		title = CATEGORY_META[segments[1]].name;
	} else if (segments[0] === "settings") {
		title = "Providers & Models";
	}

	return (
		<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm">
			<SidebarTrigger className="-ml-1" />
			<Separator orientation="vertical" className="mr-2 h-4" />
			<div className="flex items-center gap-1.5 text-sm">
				<span className="text-muted-foreground">Poly-AI</span>
				<span className="text-muted-foreground/50">/</span>
				<span className="font-medium text-foreground">{title}</span>
			</div>
		</header>
	);
}
