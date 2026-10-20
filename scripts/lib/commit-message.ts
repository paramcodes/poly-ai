/**
 * Commit-message parsing shared by the `commit-msg` hook and its tests.
 */

/** Commits whose staged diff exceeds this many tokens must include a body. */
export const BODY_REQUIRED_TOKEN_THRESHOLD = 150;

/** Trailer lines look like `Key: value` and are not a body. */
const TRAILER_PATTERN = /^[A-Za-z][A-Za-z0-9-]*:\s+\S/;

/**
 * Split a commit message into its subject and its substantive body, ignoring
 * trailers and comment lines.
 */
export function splitMessage(message: string): {
	subject: string;
	body: string;
} {
	const withoutComments = message
		.split("\n")
		.filter((line) => !line.startsWith("#"))
		.join("\n");

	const lines = withoutComments.split("\n");
	const subject = (lines[0] ?? "").trim();
	const rest = lines.slice(1);

	// Drop trailing blank lines and the trailing trailer block.
	let end = rest.length;
	while (end > 0 && rest[end - 1]?.trim() === "") end -= 1;

	const bodyLines: string[] = [];
	for (let index = 0; index < end; index += 1) {
		const line = rest[index] ?? "";
		if (line.trim() === "") {
			bodyLines.push(line);
			continue;
		}
		// A trailer is only a trailer if it appears in the final block and every
		// remaining non-blank line is also a trailer.
		const isTrailerBlock = rest
			.slice(index)
			.filter((candidate) => candidate.trim() !== "")
			.every((candidate) => TRAILER_PATTERN.test(candidate));
		if (isTrailerBlock) break;
		bodyLines.push(line);
	}

	return { subject, body: bodyLines.join("\n").trim() };
}
