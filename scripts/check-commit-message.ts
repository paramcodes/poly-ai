#!/usr/bin/env tsx
/**
 * Commit-message body rule.
 *
 * Conventional Commits gives us a subject line, but a subject alone does not
 * explain *what* changed and *why*. Once a commit carries enough change to
 * need explaining, a body is required.
 *
 * A body made up only of trailers (`Refs:`, `Co-authored-by:`) does not count —
 * those are metadata, not an explanation.
 *
 * Run manually with:  pnpm check:commit-message <message-file>
 */
import { readFileSync } from "node:fs";
import {
	BODY_REQUIRED_TOKEN_THRESHOLD,
	splitMessage,
} from "./lib/commit-message";
import { countStagedTokens } from "./lib/commit-tokens";

function main() {
	const messagePath = process.argv[2];
	if (!messagePath) {
		console.error("Usage: check-commit-message.ts <message-file>");
		process.exit(2);
	}

	const message = readFileSync(messagePath, "utf8");
	const { subject, body } = splitMessage(message);
	const report = countStagedTokens();

	if (report.total <= BODY_REQUIRED_TOKEN_THRESHOLD) {
		return;
	}

	if (body.length > 0) {
		return;
	}

	console.error("");
	console.error(
		`✖ Commit rejected: this change is ${report.total} tokens, so the message needs a body.`,
	);
	console.error("");
	console.error(
		"Describe what changed and why — a subject line alone is not enough",
	);
	console.error("for a change this size. For example:");
	console.error("");
	console.error(`  ${subject}`);
	console.error("");
	console.error("  Adds the X so that Y, which fixes Z.");
	console.error("");
	console.error("  - detail one");
	console.error("  - detail two");
	console.error("");
	process.exit(1);
}

main();
