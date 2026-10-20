import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";

interface RouteProps {
	params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteProps) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	if (!id) {
		return NextResponse.json({ error: "Missing id" }, { status: 400 });
	}

	const [item] = await db
		.select()
		.from(generations)
		.where(and(eq(generations.id, id), eq(generations.userId, user.id)));

	if (!item) {
		return NextResponse.json(
			{ error: "Generation not found" },
			{ status: 404 },
		);
	}

	return NextResponse.json({ generation: item });
}
