/**
 * Shared helpers for the commit discipline tooling.
 *
 * The commit-size gate is a proxy measurement: it tokenises the *added* lines of
 * a diff and compares the total against a limit. It is not an exact model-token
 * count, but it is stable, monotonic with diff size, and cheap enough to run on
 * every commit.
 */
import { execFileSync } from "node:child_process";
import { encode } from "gpt-tokenizer";

/** Default maximum number of tokens a single commit's diff may contain. */
export const DEFAULT_TOKEN_LIMIT = 3000;

/**
 * Flat penalty applied to each binary file in a commit. A screenshot or a
 * recorded video carries no reviewable diff, so it is charged a fixed cost
 * instead of being counted as free.
 */
export const BINARY_FILE_PENALTY = 2000;

/**
 * Paths that are exempt from the gate, because their contents are generated or
 * vendored rather than authored:
 *
 * - `pnpm-lock.yaml`  — the resolved dependency graph, rewritten by the package
 *   manager. Its size says nothing about how much the change was reviewed.
 * - `docs/evidence/**` — committed screenshots and GIFs used as PR evidence.
 *   These are reviewed as images, not as a diff, and are produced by the
 *   evidence-capture script rather than hand-written.
 *
 * Everything else is gated, including any other binary file.
 */
export const EXEMPT_PATTERNS: RegExp[] = [
	/^pnpm-lock\.yaml$/,
	/^docs\/evidence\//,
];

export interface FileTokenCount {
	path: string;
	tokens: number;
	binary: boolean;
	exempt: boolean;
}

export interface DiffTokenReport {
	files: FileTokenCount[];
	total: number;
	limit: number;
	/** Total ignoring exemptions — what the change would cost if nothing were exempt. */
	ungatedTotal: number;
}

export function isExempt(path: string): boolean {
	return EXEMPT_PATTERNS.some((pattern) => pattern.test(path));
}

export function resolveLimit(
	env: Record<string, string | undefined> = process.env,
): number {
	const raw = env.COMMIT_TOKEN_LIMIT;
	if (!raw) return DEFAULT_TOKEN_LIMIT;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_LIMIT;
}

/** Run a git command and return stdout, or `null` when the command fails. */
export function git(args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch {
		return null;
	}
}

/**
 * Return the list of files staged for commit, in the form `git diff --cached
 * --name-status` reports them.
 */
export function stagedFiles(): { path: string; status: string }[] {
	const out = git(["diff", "--cached", "--name-status", "--no-renames"]);
	if (!out) return [];
	return out
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [status, ...rest] = line.split("\t");
			return { status: status ?? "", path: rest.join("\t") };
		})
		.filter((entry) => entry.path.length > 0);
}

/**
 * Count the tokens contributed by the added lines of the staged diff, per file.
 *
 * Binary files are detected from `--numstat`, which reports `-` for both
 * columns when a file is binary. They are charged {@link BINARY_FILE_PENALTY}.
 */
export function countStagedTokens(): DiffTokenReport {
	const limit = resolveLimit();
	const numstat = git(["diff", "--cached", "--numstat", "--no-renames"]) ?? "";
	const binaryPaths = new Set<string>();

	for (const line of numstat.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const [added, removed, ...rest] = trimmed.split("\t");
		if (added === "-" && removed === "-") {
			const path = rest.join("\t");
			if (path) binaryPaths.add(path);
		}
	}

	const patch =
		git([
			"diff",
			"--cached",
			"--no-color",
			"--no-ext-diff",
			"--no-renames",
			"--diff-filter=ACMR",
			// `--no-prefix` pins the `---`/`+++` paths to the repository path.
			// Without it the prefix depends on the user's git configuration:
			// `diff.mnemonicPrefix` (commonly enabled globally) rewrites `a/`
			// and `b/` into `c/` and `i/`, and `diff.noprefix` removes them
			// entirely. Neither matches the `a/`/`b/` strip below, so the
			// per-file lookup silently misses and every text file is counted
			// as zero tokens — which makes the gate report a clean tree.
			"--no-prefix",
		]) ?? "";

	const perFile = new Map<string, string[]>();
	let current: string | null = null;
	for (const line of patch.split("\n")) {
		if (line.startsWith("+++ ")) {
			const target = line.slice(4).trim();
			// Strip the `a/` or `b/` prefix git adds, in case a future git
			// ignores `--no-prefix`.
			current = target.replace(/^[ab]\//, "");
			if (!perFile.has(current)) perFile.set(current, []);
			continue;
		}
		if (line.startsWith("--- ")) continue;
		if (current === null) continue;
		if (line.startsWith("+")) {
			perFile.get(current)?.push(line.slice(1));
		}
	}

	const staged = stagedFiles();
	const files: FileTokenCount[] = [];

	for (const entry of staged) {
		const { path } = entry;
		const binary = binaryPaths.has(path);
		const exempt = isExempt(path);
		const lines = perFile.get(path) ?? [];
		const textTokens = lines.length > 0 ? encode(lines.join("\n")).length : 0;
		const tokens = binary ? BINARY_FILE_PENALTY : textTokens;
		files.push({ path, tokens, binary, exempt });
	}

	const total = files
		.filter((file) => !file.exempt)
		.reduce((sum, file) => sum + file.tokens, 0);
	const ungatedTotal = files.reduce((sum, file) => sum + file.tokens, 0);

	return { files, total, limit, ungatedTotal };
}

/** Render a human-readable report for the terminal. */
export function formatReport(report: DiffTokenReport): string {
	const lines: string[] = [];
	lines.push("Commit size report");
	lines.push("==================");
	for (const file of [...report.files].sort((a, b) => b.tokens - a.tokens)) {
		const flags = [
			file.binary ? "binary" : "",
			file.exempt ? "exempt" : "",
		].filter(Boolean);
		const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
		lines.push(
			`  ${String(file.tokens).padStart(6)} tokens  ${file.path}${suffix}`,
		);
	}
	lines.push("");
	lines.push(
		`  gated total: ${report.total} / ${report.limit} tokens` +
			(report.ungatedTotal !== report.total
				? `  (${report.ungatedTotal} before exemptions)`
				: ""),
	);
	return lines.join("\n");
}
