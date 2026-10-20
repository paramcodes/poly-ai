/** @type {import('@commitlint/cli').UserConfig} */
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		// Conventional Commits caps the subject at 72 characters; bodies and
		// footers are free-form so that a commit can explain itself properly.
		"body-max-line-length": [0],
		"footer-max-line-length": [0],
		"type-enum": [
			2,
			"always",
			[
				"feat",
				"fix",
				"docs",
				"style",
				"refactor",
				"perf",
				"test",
				"build",
				"ci",
				"chore",
				"revert",
			],
		],
	},
};
