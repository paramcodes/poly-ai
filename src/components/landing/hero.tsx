"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppPreview } from "./app-preview";

const EASE = [0.23, 1, 0.32, 1] as const;

export function Hero() {
	const reduceMotion = useReducedMotion();

	const fade = (delay: number) =>
		reduceMotion
			? {}
			: {
					initial: { opacity: 0, y: 12 },
					animate: { opacity: 1, y: 0 },
					transition: { duration: 0.5, delay, ease: EASE },
				};

	return (
		<section className="relative overflow-hidden">
			{/* Ambient background wash. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--brand)_0%,transparent_70%)] opacity-[0.12]"
			/>

			<div className="mx-auto max-w-6xl px-6 pt-16 pb-10 sm:pt-24">
				<div className="mx-auto max-w-3xl text-center">
					<motion.div {...fade(0)}>
						<Badge
							variant="secondary"
							className="gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
						>
							<ShieldCheck className="size-3" />
							Keys encrypted at rest · never sent to the browser
						</Badge>
					</motion.div>

					<motion.h1
						{...fade(0.06)}
						className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
					>
						Every model you own.
						<br />
						<span className="text-muted-foreground">One studio.</span>
					</motion.h1>

					<motion.p
						{...fade(0.12)}
						className="mx-auto mt-5 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg"
					>
						Poly-AI is a bring-your-own-key generation studio. Add as many
						providers as you like, assign their models to a category, and
						generate text, images, video, music and live website artifacts.
					</motion.p>

					<motion.div
						{...fade(0.18)}
						className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
					>
						<Button size="lg" className="w-full gap-2 sm:w-auto">
							Create an account
							<ArrowRight className="size-4" />
						</Button>
						<Button
							size="lg"
							variant="outline"
							className="w-full sm:w-auto"
							asChild
						>
							<a href="#categories">Browse the catalogue</a>
						</Button>
					</motion.div>
				</div>

				<motion.div
					{...(reduceMotion
						? {}
						: {
								initial: { opacity: 0, y: 24 },
								animate: { opacity: 1, y: 0 },
								transition: { duration: 0.7, delay: 0.24, ease: EASE },
							})}
					className="mx-auto mt-14 max-w-5xl"
				>
					<AppPreview />
				</motion.div>
			</div>
		</section>
	);
}
