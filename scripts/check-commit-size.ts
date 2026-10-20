#!/usr/bin/env tsx
/**
 * Commit-size gate.
 *
 * Fails the commit when the staged diff exceeds the token limit (default 3000,
 * override with `COMMIT_TOKEN_LIMIT`). When passed `--base <ref>`, checks each
 * commit on the current branch since `<ref>`.
 *
 * Run manually with:  pnpm check:commit-size
 * Run in CI with:     pnpm check:commit-size --base origin/master
 */
import {
	countCommitTokens,
	countStagedTokens,
	formatReport,
	getBranchCommits,
	resolveLimit,
} from "./lib/commit-tokens";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const headIdx = args.indexOf("--head");

if (baseIdx !== -1) {
	const base = args[baseIdx + 1] || "origin/master";
	const head = headIdx !== -1 && args[headIdx + 1] ? args[headIdx + 1] : "HEAD";
	const commits = getBranchCommits(base, head);

	if (commits.length === 0) {
		console.log(`✔ No commits between ${base} and ${head}.`);
		process.exit(0);
	}

	console.log(`Checking ${commits.length} commit(s) against ${base}...`);
	let failed = false;

	for (const sha of commits) {
		const report = countCommitTokens(sha);
		console.log(`\nCommit ${sha.slice(0, 7)}:`);
		console.log(formatReport(report));

		if (report.total > report.limit) {
			failed = true;
			console.error(
				`✖ Commit ${sha.slice(0, 7)} rejected: ${report.total} tokens exceeds limit of ${report.limit}.`,
			);
		}
	}

	if (failed) {
		console.error("\n✖ One or more commits exceeded the commit token limit.");
		process.exit(1);
	}

	console.log(`\n✔ All ${commits.length} commit(s) within token limit.`);
	process.exit(0);
}

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
	console.error("to a higher number, for example:");
	console.error("");
	console.error(`  COMMIT_TOKEN_LIMIT=${report.total} git commit`);
	console.error("");
	process.exit(1);
}

console.log("");
console.log(`✔ Commit size OK (${report.total} / ${resolveLimit()} tokens).`);
