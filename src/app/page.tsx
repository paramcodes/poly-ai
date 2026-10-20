import { Clapperboard, Code2, ImageIcon, Music2, Type } from "lucide-react";
import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { ThemeToggle } from "@/components/landing/theme-toggle";
import { Button } from "@/components/ui/button";
import { CATEGORY_META, SIDEBAR_CATEGORIES } from "@/lib/categories";

const CATEGORY_ICONS = {
	text: Type,
	image: ImageIcon,
	video: Clapperboard,
	music: Music2,
	website: Code2,
} as const;

export default function HomePage() {
	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
					<Link href="/" className="flex items-center gap-2.5">
						<span className="grid size-6 place-items-center rounded-md bg-brand">
							<span className="size-2 rounded-[2px] bg-white" />
						</span>
						<span className="text-sm font-semibold tracking-tight">
							Poly-AI
						</span>
					</Link>

					<nav className="ml-auto flex items-center gap-1">
						<ThemeToggle />
						<Button size="sm" asChild>
							<Link href="/sign-in" prefetch={false}>
								Sign in
							</Link>
						</Button>
					</nav>
				</div>
			</header>

			<main className="flex-1">
				<Hero />

				<section
					id="categories"
					className="mx-auto max-w-6xl scroll-mt-16 px-6 pt-8 pb-20"
				>
					<div className="flex items-end justify-between gap-4">
						<div>
							<h2 className="text-xl font-semibold tracking-tight">
								Five surfaces, one catalogue
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Each category lists the models your providers expose. If a
								category has nothing to show, we say so plainly instead of
								hiding the panel.
							</p>
						</div>
						<p className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">
							models.dev · 232 providers
						</p>
					</div>

					<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{SIDEBAR_CATEGORIES.map((category) => {
							const meta = CATEGORY_META[category];
							const Icon = CATEGORY_ICONS[category];
							return (
								<div
									key={category}
									className="group bg-card rounded-lg border p-4 transition-colors hover:border-foreground/20"
								>
									<div className="flex items-center gap-2.5">
										<span className="bg-muted text-muted-foreground grid size-8 place-items-center rounded-md">
											<Icon className="size-4" />
										</span>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{meta.name}
											</p>
											<p className="font-mono text-[11px] text-muted-foreground">
												{meta.catalogueSize}
											</p>
										</div>
									</div>
									<p className="mt-3 text-sm text-pretty text-muted-foreground">
										{meta.description}
									</p>
								</div>
							);
						})}

						<div className="bg-muted/30 rounded-lg border border-dashed p-4">
							<p className="text-sm font-medium">Anything else</p>
							<p className="mt-3 text-sm text-pretty text-muted-foreground">
								193 of the 232 known providers speak the OpenAI-compatible API,
								so a custom base URL is usually all it takes to add one.
							</p>
						</div>
					</div>
				</section>
			</main>

			<footer className="border-t">
				<div className="text-muted-foreground mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs">
					<p>Poly-AI — bring your own key, use every model.</p>
					<p className="font-mono">v0.1.0</p>
				</div>
			</footer>
		</div>
	);
}
