import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { retryMediaJob } from "@/server/generation/job";

interface RouteProps {
	params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteProps) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	if (!id) {
		return NextResponse.json({ error: "Missing id" }, { status: 400 });
	}

	try {
		const generation = await retryMediaJob(user.id, id);
		if (!generation) {
			return NextResponse.json(
				{ error: "Generation not found" },
				{ status: 404 },
			);
		}
		return NextResponse.json({ generation }, { status: 202 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to retry generation";
		const status = message.includes("not found")
			? 404
			: message.includes("disabled")
				? 403
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
