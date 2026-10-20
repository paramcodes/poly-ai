import { type NextRequest, NextResponse } from "next/server";
import type { Category } from "@/lib/categories";
import { getCurrentUser } from "@/lib/session";
import {
	assignModel,
	deleteModel,
	listUserModels,
	toggleModel,
} from "@/server/providers/service";

export async function GET(req: NextRequest) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const category = req.nextUrl.searchParams.get("category") as
		| Category
		| undefined;

	try {
		const userModels = await listUserModels(user.id, category);
		return NextResponse.json({ models: userModels });
	} catch (error) {
		console.error("GET /api/models failed:", error);
		return NextResponse.json(
			{ error: "Failed to list models" },
			{ status: 500 },
		);
	}
}

export async function POST(req: Request) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await req.json();
		const {
			providerId,
			modelId,
			name,
			category,
			capabilities = [],
			force = false,
		} = body;

		if (!providerId || !modelId || !name || !category) {
			return NextResponse.json(
				{ error: "providerId, modelId, name, and category are required" },
				{ status: 400 },
			);
		}

		const result = await assignModel({
			userId: user.id,
			providerId,
			modelId,
			name,
			category,
			capabilities,
			force,
		});

		if (!result.ok) {
			return NextResponse.json(
				{
					error: result.error,
					gating: result.gating,
				},
				{ status: 422 },
			);
		}

		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		console.error("POST /api/models failed:", error);
		return NextResponse.json(
			{ error: "Failed to assign model" },
			{ status: 500 },
		);
	}
}

export async function PATCH(req: Request) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await req.json();
		const { id, enabled } = body;
		if (!id || typeof enabled !== "boolean") {
			return NextResponse.json(
				{ error: "id and enabled boolean are required" },
				{ status: 400 },
			);
		}

		const updated = await toggleModel(user.id, id, enabled);
		return NextResponse.json({ model: updated });
	} catch (error) {
		console.error("PATCH /api/models failed:", error);
		return NextResponse.json(
			{ error: "Failed to update model" },
			{ status: 500 },
		);
	}
}

export async function DELETE(req: NextRequest) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const id = req.nextUrl.searchParams.get("id");
	if (!id) {
		return NextResponse.json({ error: "id is required" }, { status: 400 });
	}

	try {
		await deleteModel(user.id, id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("DELETE /api/models failed:", error);
		return NextResponse.json(
			{ error: "Failed to delete model" },
			{ status: 500 },
		);
	}
}
