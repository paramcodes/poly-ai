import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createProvider, listUserProviders } from "@/server/providers/service";

export async function GET() {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const userProviders = await listUserProviders(user.id);
		return NextResponse.json({ providers: userProviders });
	} catch (error) {
		console.error("GET /api/providers failed:", error);
		return NextResponse.json(
			{ error: "Failed to list providers" },
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
		const { name, kind, apiKey, baseUrl } = body;

		if (!name || !kind || !apiKey) {
			return NextResponse.json(
				{ error: "Name, kind, and apiKey are required" },
				{ status: 400 },
			);
		}

		const result = await createProvider({
			userId: user.id,
			name,
			kind,
			apiKey,
			baseUrl,
		});

		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		console.error("POST /api/providers failed:", error);
		return NextResponse.json(
			{ error: "Failed to create provider" },
			{ status: 500 },
		);
	}
}
