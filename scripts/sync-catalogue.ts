import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT_PATH = resolve(
	process.cwd(),
	"src/server/catalogue/models.dev.snapshot.json",
);

async function main() {
	console.log("Fetching live models.dev catalogue...");
	const res = await fetch("https://models.dev/api.json", {
		headers: {
			"User-Agent": "poly-ai-catalogue-sync",
		},
	});

	if (!res.ok) {
		throw new Error(
			`Failed to fetch models.dev catalogue: ${res.status} ${res.statusText}`,
		);
	}

	const data = await res.json();
	const providerCount = Object.keys(data).length;
	console.log(`Fetched catalogue with ${providerCount} providers.`);

	writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2), "utf-8");
	console.log(`Snapshot saved to ${SNAPSHOT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
