import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
	createMediaJob,
	createSpeechGeneration,
	isValidMusicGenerateRequestBody,
} from "@/server/generation/job";

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

	if (!isValidMusicGenerateRequestBody(body)) {
		return NextResponse.json(
			{
				error: "Invalid request: prompt, providerId, and modelId are required",
			},
			{ status: 400 },
		);
	}

	try {
		const generation =
			body.mode === "voice"
				? await createSpeechGeneration({
						userId: user.id,
						providerId: body.providerId.trim(),
						modelId: body.modelId.trim(),
						text: body.prompt.trim(),
					})
				: await createMediaJob({
						userId: user.id,
						providerId: body.providerId.trim(),
						modelId: body.modelId.trim(),
						category: "music",
						prompt: body.prompt.trim(),
						params: body.params,
					});
		return NextResponse.json({ generation }, { status: 202 });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to start music generation";
		const status = message.includes("not found")
			? 404
			: message.includes("disabled")
				? 403
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
