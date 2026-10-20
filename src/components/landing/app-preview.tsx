import {
	Clapperboard,
	Code2,
	History,
	ImageIcon,
	Music2,
	Settings,
	Type,
} from "lucide-react";
import { CATEGORY_META, SIDEBAR_CATEGORIES } from "@/lib/categories";

const CATEGORY_ICONS = {
	text: Type,
	image: ImageIcon,
	video: Clapperboard,
	music: Music2,
	website: Code2,
} as const;

/**
 * A static, non-interactive illustration of the application shell.
 *
 * It is a preview, not the real thing: the live shell arrives with the
 * category phase. Keeping it hand-drawn (rather than reusing the real
 * `Sidebar`) means the preview can show a compressed layout that does not
 * exist yet, and it costs no client-side interactivity.
 */
export function AppPreview() {
	return (
		<div className="bg-card overflow-hidden rounded-xl border shadow-2xl shadow-black/10 dark:shadow-black/40">
			{/* Title bar */}
			<div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
				<span className="size-2.5 rounded-full bg-red-400/80" />
				<span className="size-2.5 rounded-full bg-amber-400/80" />
				<span className="size-2.5 rounded-full bg-emerald-400/80" />
				<div className="ml-3 flex-1 truncate rounded-md bg-background/70 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
					poly-ai.app/app/website
				</div>
			</div>

			<div className="flex h-[22rem] text-left sm:h-[24rem]">
				{/* Sidebar */}
				<div className="flex w-44 shrink-0 flex-col gap-5 border-r bg-muted/25 p-3">
					<div className="flex items-center gap-2 px-1">
						<div className="size-5 shrink-0 rounded-[5px] bg-brand" />
						<span className="truncate text-[13px] font-semibold tracking-tight">
							Poly-AI
						</span>
					</div>

					<div className="space-y-0.5">
						<p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
							Generate
						</p>
						{SIDEBAR_CATEGORIES.map((category) => {
							const meta = CATEGORY_META[category];
							const Icon = CATEGORY_ICONS[category];
							const active = category === "website";
							return (
								<div
									key={category}
									className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
										active
											? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
											: "text-muted-foreground"
									}`}
								>
									<Icon className="size-3.5 shrink-0" />
									<span className="truncate">{meta.name}</span>
								</div>
							);
						})}
					</div>

					<div className="space-y-0.5">
						<p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
							Manage
						</p>
						{[
							{ label: "Settings", Icon: Settings },
							{ label: "History", Icon: History },
						].map(({ label, Icon }) => (
							<div
								key={label}
								className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground"
							>
								<Icon className="size-3.5 shrink-0" />
								<span className="truncate">{label}</span>
							</div>
						))}
					</div>
				</div>

				{/* Main area */}
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-center justify-between border-b px-4 py-2.5">
						<div className="flex items-center gap-2">
							<span className="text-[13px] font-medium">Website</span>
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
								qwen3-coder
							</span>
						</div>
						<div className="flex gap-1">
							<span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
								Preview
							</span>
							<span className="rounded-md px-2 py-1 text-[10px] text-muted-foreground">
								Code
							</span>
						</div>
					</div>

					<div className="grid min-h-0 flex-1 grid-cols-5 gap-px bg-border">
						{/* Prompt pane */}
						<div className="col-span-2 flex flex-col gap-2 bg-background p-3">
							<div className="flex-1 space-y-2">
								<div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-primary px-2.5 py-1.5 text-[11px] text-primary-foreground">
									A landing page for a coffee subscription, warm and editorial.
								</div>
								<div className="w-fit max-w-[90%] rounded-lg rounded-bl-sm bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
									<span className="mb-1 block h-1.5 w-24 rounded-full bg-foreground/25" />
									<span className="mb-1 block h-1.5 w-32 rounded-full bg-foreground/15" />
									<span className="block h-1.5 w-16 rounded-full bg-foreground/15" />
								</div>
							</div>
							<div className="rounded-md border bg-muted/30 px-2.5 py-2 text-[10px] text-muted-foreground">
								Describe the site…
							</div>
						</div>

						{/* Preview pane */}
						<div className="col-span-3 bg-background p-3">
							<div className="flex h-full flex-col overflow-hidden rounded-md border bg-background">
								<div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
									<span className="size-1.5 rounded-full bg-foreground/20" />
									<span className="size-1.5 rounded-full bg-foreground/20" />
									<span className="size-1.5 rounded-full bg-foreground/20" />
								</div>
								<div className="flex-1 space-y-2 p-3">
									<span className="block h-2 w-20 rounded-full bg-primary/40" />
									<span className="block h-3 w-32 rounded-full bg-foreground/70" />
									<span className="block h-1.5 w-24 rounded-full bg-foreground/20" />
									<div className="grid grid-cols-3 gap-1.5 pt-1">
										{[0, 1, 2].map((index) => (
											<div
												key={index}
												className="aspect-[3/4] rounded-sm bg-muted"
											/>
										))}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
