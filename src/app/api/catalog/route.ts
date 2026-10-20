import { NextResponse } from "next/server";
import { getCatalogue } from "@/server/catalogue";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const catalogue = await getCatalogue();
		return NextResponse.json(catalogue, {
			headers: {
				"Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
			},
		});
	} catch (error) {
		console.error("GET /api/catalog failed:", error);
		return NextResponse.json(
			{ error: "Failed to load catalogue" },
			{ status: 500 },
		);
	}
}
