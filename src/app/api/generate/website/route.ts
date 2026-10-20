import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
	createStreamingGeneration,
	isValidGenerateRequestBody,
} from "@/server/generation/stream";

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

	if (!isValidGenerateRequestBody(body)) {
		return NextResponse.json(
			{
				error:
					"Invalid request: messages (non-empty array), providerId, and modelId are required",
			},
			{ status: 400 },
		);
	}

	try {
		return await createStreamingGeneration({
			userId: user.id,
			category: "website",
			providerId: body.providerId.trim(),
			modelId: body.modelId.trim(),
			messages: body.messages,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to generate website";
		const status = message.includes("not found")
			? 404
			: message.includes("disabled")
				? 403
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
