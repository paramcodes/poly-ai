import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
	deleteProvider,
	updateProvider,
	verifyProvider,
} from "@/server/providers/service";

export async function PATCH(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	try {
		const body = await req.json();
		const updated = await updateProvider(user.id, id, body);
		return NextResponse.json({ provider: updated });
	} catch (error) {
		console.error("PATCH /api/providers/[id] failed:", error);
		return NextResponse.json(
			{ error: "Failed to update provider" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	try {
		await deleteProvider(user.id, id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("DELETE /api/providers/[id] failed:", error);
		return NextResponse.json(
			{ error: "Failed to delete provider" },
			{ status: 500 },
		);
	}
}

export async function POST(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	try {
		const result = await verifyProvider(user.id, id);
		return NextResponse.json(result);
	} catch (error) {
		console.error("POST /api/providers/[id]/verify failed:", error);
		return NextResponse.json(
			{ error: "Failed to verify provider" },
			{ status: 500 },
		);
	}
}
