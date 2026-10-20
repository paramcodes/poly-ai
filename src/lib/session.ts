import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getCurrentUser() {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({
		headers: reqHeaders,
	});

	return session?.user ?? null;
}
