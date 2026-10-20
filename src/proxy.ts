import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 Proxy guarding /app/** and /settings/** routes.
 * Checks for the presence of the Better Auth session token cookie.
 * In production/secure setups, Better Auth prefixes cookies with __Secure-.
 */
export function proxy(request: NextRequest) {
	const sessionToken =
		request.cookies.get("better-auth.session_token")?.value ||
		request.cookies.get("__Secure-better-auth.session_token")?.value;

	if (!sessionToken) {
		const signInUrl = new URL("/sign-in", request.url);
		signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
		return NextResponse.redirect(signInUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/app/:path*", "/settings/:path*"],
};
