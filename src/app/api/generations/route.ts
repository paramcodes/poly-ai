import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
	GENERATION_CATEGORIES,
	type GenerationCategory,
	generations,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: NextRequest) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const searchParams = req.nextUrl.searchParams;
	const categoryParam = searchParams.get("category");
	const limitParam = searchParams.get("limit");

	const limit = limitParam
		? Math.min(Math.max(1, Number(limitParam) || 50), 100)
		: 50;

	const conditions = [eq(generations.userId, user.id)];

	if (
		categoryParam &&
		GENERATION_CATEGORIES.includes(categoryParam as GenerationCategory)
	) {
		conditions.push(
			eq(generations.category, categoryParam as GenerationCategory),
		);
	}

	const items = await db
		.select()
		.from(generations)
		.where(and(...conditions))
		.orderBy(desc(generations.createdAt))
		.limit(limit);

	return NextResponse.json({ generations: items });
}
