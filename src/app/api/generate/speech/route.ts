import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createSpeechGeneration } from "@/server/generation/job";

export interface GenerateSpeechRequestBody {
	text: string;
	providerId: string;
	modelId: string;
}

export function isValidSpeechRequestBody(
	body: unknown,
): body is GenerateSpeechRequestBody {
	if (!body || typeof body !== "object") {
		return false;
	}
	const b = body as Record<string, unknown>;
	if (typeof b.text !== "string" || b.text.trim().length === 0) {
		return false;
	}
	if (typeof b.providerId !== "string" || b.providerId.trim().length === 0) {
		return false;
	}
	if (typeof b.modelId !== "string" || b.modelId.trim().length === 0) {
		return false;
	}
	return true;
}

export async function POST(req: Request) {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!isValidSpeechRequestBody(body)) {
		return NextResponse.json(
			{
				error: "Invalid request: text, providerId, and modelId are required",
			},
			{ status: 400 },
		);
	}

	try {
		const generation = await createSpeechGeneration({
			userId: user.id,
			providerId: body.providerId.trim(),
			modelId: body.modelId.trim(),
			text: body.text.trim(),
		});
		return NextResponse.json({ generation }, { status: 200 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to generate speech";
		const status = message.includes("not found")
			? 404
			: message.includes("disabled")
				? 403
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
