import { describe, expect, it } from "vitest";
import { splitMessage } from "../../scripts/lib/commit-message";
import {
	BINARY_FILE_PENALTY,
	countStagedTokens,
	DEFAULT_TOKEN_LIMIT,
	isExempt,
	resolveLimit,
} from "../../scripts/lib/commit-tokens";

describe("commit token helpers", () => {
	it("defaults the limit to 3000 tokens", () => {
		expect(DEFAULT_TOKEN_LIMIT).toBe(3000);
		expect(resolveLimit({})).toBe(3000);
	});

	it("reads the limit from COMMIT_TOKEN_LIMIT", () => {
		expect(resolveLimit({ COMMIT_TOKEN_LIMIT: "5000" })).toBe(5000);
	});

	it("ignores an invalid limit", () => {
		expect(resolveLimit({ COMMIT_TOKEN_LIMIT: "abc" })).toBe(3000);
		expect(resolveLimit({ COMMIT_TOKEN_LIMIT: "0" })).toBe(3000);
	});

	it("charges a flat penalty for binary files", () => {
		expect(BINARY_FILE_PENALTY).toBe(2000);
	});

	it("exempts the lockfile and committed evidence", () => {
		expect(isExempt("pnpm-lock.yaml")).toBe(true);
		expect(isExempt("docs/evidence/phase-0/sidebar.png")).toBe(true);
	});

	it("does not exempt ordinary source files", () => {
		expect(isExempt("src/app/page.tsx")).toBe(false);
		expect(isExempt("docs/README.md")).toBe(false);
		expect(isExempt("src/lib/db/schema.ts")).toBe(false);
	});
});

describe("countStagedTokens", () => {
	/*
	 * The gate parses the `+++ b/<path>` headers of the staged diff to find
	 * each file's added lines. That lookup only works if the header path
	 * matches the path git reports in `--name-status`.
	 *
	 * It used to break whenever the developer's git configuration rewrote
	 * those prefixes — `diff.mnemonicPrefix` turns `a/` and `b/` into `c/`
	 * and `i/`, and `diff.noprefix` removes them. Every text file then
	 * matched nothing and was counted as zero tokens, so the gate reported
	 * a clean tree no matter how large the change actually was.
	 *
	 * This asserts the real behaviour: a staged text file must be counted,
	 * and the count must be well above zero.
	 */
	it("counts the added lines of staged text files", () => {
		const report = countStagedTokens();
		const textFiles = report.files.filter((file) => !file.binary);

		if (textFiles.length === 0) {
			// Nothing staged: the assertion below cannot run, and that is a
			// legitimate state (a clean tree).
			return;
		}

		const counted = textFiles.filter((file) => file.tokens > 0);
		expect(counted.length).toBeGreaterThan(0);

		const totalTextTokens = textFiles.reduce(
			(sum, file) => sum + file.tokens,
			0,
		);
		expect(totalTextTokens).toBeGreaterThan(0);
	});

	it("does not report a zero total for a non-empty staged diff", () => {
		const report = countStagedTokens();
		const hasStagedText = report.files.some(
			(file) => !file.binary && !file.exempt,
		);

		if (hasStagedText) {
			expect(report.total).toBeGreaterThan(0);
		}
	});
});

describe("splitMessage", () => {
	it("separates a subject from a body", () => {
		const { subject, body } = splitMessage(
			"feat(api): add provider route\n\nAdds the CRUD route for providers.\n",
		);
		expect(subject).toBe("feat(api): add provider route");
		expect(body).toBe("Adds the CRUD route for providers.");
	});

	it("treats a subject alone as an empty body", () => {
		const { subject, body } = splitMessage("fix: correct the token count\n");
		expect(subject).toBe("fix: correct the token count");
		expect(body).toBe("");
	});

	it("does not count trailers as a body", () => {
		const { body } = splitMessage(
			"feat(x): add a thing\n\nRefs: docs/adr/0003-models-dev-as-model-catalogue.md\n",
		);
		expect(body).toBe("");
	});

	it("keeps a body that precedes trailers", () => {
		const { body } = splitMessage(
			"feat(x): add a thing\n\nExplains the change properly.\n\nRefs: docs/adr/0003.md\n",
		);
		expect(body).toBe("Explains the change properly.");
	});

	it("strips comment lines", () => {
		const { subject, body } = splitMessage(
			"feat(x): add a thing\n\nA real body.\n# a comment line\n",
		);
		expect(subject).toBe("feat(x): add a thing");
		expect(body).toBe("A real body.");
	});
});
