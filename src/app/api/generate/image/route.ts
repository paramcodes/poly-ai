import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createImageGenerationStream } from "@/server/generation/image";

export interface GenerateImageRequestBody {
	prompt: string;
	providerId: string;
	modelId: string;
	aspectRatio?: string;
	size?: `${number}x${number}`;
}

export function isValidImageGenerateRequestBody(
	body: unknown,
): body is GenerateImageRequestBody {
	if (!body || typeof body !== "object") {
		return false;
	}
	const b = body as Record<string, unknown>;
	if (typeof b.prompt !== "string" || b.prompt.trim().length === 0) {
		return false;
	}
	if (typeof b.providerId !== "string" || b.providerId.trim().length === 0) {
		return false;
	}
	if (typeof b.modelId !== "string" || b.modelId.trim().length === 0) {
		return false;
	}
	if (b.aspectRatio !== undefined && typeof b.aspectRatio !== "string") {
		return false;
	}
	if (b.size !== undefined && typeof b.size !== "string") {
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

	if (!isValidImageGenerateRequestBody(body)) {
		return NextResponse.json(
			{
				error: "Invalid request: prompt, providerId, and modelId are required",
			},
			{ status: 400 },
		);
	}

	try {
		return await createImageGenerationStream({
			userId: user.id,
			providerId: body.providerId.trim(),
			modelId: body.modelId.trim(),
			prompt: body.prompt.trim(),
			aspectRatio: body.aspectRatio?.trim(),
			size: body.size?.trim() as `${number}x${number}` | undefined,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to generate image";
		const status = message.includes("not found")
			? 404
			: message.includes("disabled")
				? 403
				: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
