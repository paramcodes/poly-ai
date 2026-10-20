import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/*
	 * `cacheComponents` and `partialPrefetching` are intentionally off. The app
	 * is auth-gated and per-user dynamic: every route reads the session cookie
	 * and provider keys, so the request-scoped caching these options enable buys
	 * nothing and only adds constraints.
	 */
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default nextConfig;
