#!/usr/bin/env tsx
/**
 * Commit-size gate.
 *
 * Fails the commit when the staged diff exceeds the token limit (default 3000,
 * override with `COMMIT_TOKEN_LIMIT`). The point is to keep every commit small
 * enough to actually review, and small enough that reverting it is cheap.
 *
 * Run manually with:  pnpm check:commit-size
 */
import {
	countStagedTokens,
	formatReport,
	resolveLimit,
} from "./lib/commit-tokens";

const report = countStagedTokens();

console.log(formatReport(report));

if (report.total > report.limit) {
	const over = report.total - report.limit;
	console.error("");
	console.error(
		`✖ Commit rejected: ${report.total} tokens exceeds the limit of ${report.limit} (${over} over).`,
	);
	console.error("");
	console.error(
		"Split this change into smaller, focused commits. Each commit should",
	);
	console.error("be a coherent checkpoint that leaves the repository working.");
	console.error("");
	console.error(
		"To deliberately raise the limit for a one-off, set COMMIT_TOKEN_LIMIT",
	);
	console.error(`to a higher number, for example:`);
	console.error("");
	console.error(`  COMMIT_TOKEN_LIMIT=${report.total} git commit`);
	console.error("");
	process.exit(1);
}

console.log("");
console.log(`✔ Commit size OK (${report.total} / ${resolveLimit()} tokens).`);
