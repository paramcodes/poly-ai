import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";

describe("reduced-motion audit", () => {
	it("configures global reduced-motion suppression in globals.css", () => {
		const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
		const cssContent = fs.readFileSync(cssPath, "utf8");

		expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
		expect(cssContent).toContain("animation-duration: 0.01ms;");
		expect(cssContent).toContain("transition-duration: 0.01ms;");
	});

	it("renders Skeleton with motion-reduce:animate-none", () => {
		const { container } = render(<Skeleton data-testid="skeleton" />);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("motion-reduce:animate-none");
		expect(el.className).toContain("animate-pulse");
	});

	it("includes motion-reduce classes in Hero component", () => {
		const heroPath = path.resolve(
			process.cwd(),
			"src/components/landing/hero.tsx",
		);
		const content = fs.readFileSync(heroPath, "utf8");
		expect(content).toContain("useReducedMotion");
	});
});
