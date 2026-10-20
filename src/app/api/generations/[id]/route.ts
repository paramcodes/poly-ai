import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { refreshMediaJob } from "@/server/generation/job";

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

	if (
		(item.category === "video" || item.category === "music") &&
		(item.status === "queued" || item.status === "running")
	) {
		const refreshed = await refreshMediaJob(user.id, id);
		if (refreshed) {
			return NextResponse.json({ generation: refreshed });
		}
	}

	return NextResponse.json({ generation: item });
}
