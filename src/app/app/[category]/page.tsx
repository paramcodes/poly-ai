import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryView } from "@/components/app/category-view";
import { CATEGORIES, CATEGORY_META, isCategory } from "@/lib/categories";

interface PageProps {
	params: Promise<{ category: string }>;
}

export function generateStaticParams() {
	return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { category } = await params;
	if (!isCategory(category)) {
		return { title: "Not Found — Poly-AI" };
	}

	return {
		title: `${CATEGORY_META[category].name} — Poly-AI`,
		description: CATEGORY_META[category].description,
	};
}

export default async function CategoryPage({ params }: PageProps) {
	const { category } = await params;
	if (!isCategory(category)) {
		notFound();
	}

	return <CategoryView category={category} />;
}
