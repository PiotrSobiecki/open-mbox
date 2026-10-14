/**
 * Pure helpers extracted from init-project.ts for testability.
 *
 * Nothing in this file touches the filesystem, network, or process —
 * each function is referentially transparent and tested via
 * scripts/init-project-lib.test.ts. Side-effect orchestration stays
 * in init-project.ts.
 */

import type { FanoutResult, RenameResult, RenameTarget } from "./init-project-types";

/** The template's own name, carried by every file listed in RENAME_TARGETS. */
export const ORIGINAL_WORKER_NAME = "astro-on-cf";

/**
 * Every file that carries the project name and must be rewritten during
 * scaffolding. llms.txt is generated from the tree but ships pre-built, so a
 * scaffolded project would otherwise announce itself as the template until
 * someone ran `pnpm gen:llms-txt`.
 */
export const RENAME_TARGETS: readonly RenameTarget[] = [
	{ file: "package.json", mode: "package-name" },
	{ file: "wrangler.jsonc", mode: "all-occurrences", needle: ORIGINAL_WORKER_NAME },
	{ file: "llms.txt", mode: "all-occurrences", needle: ORIGINAL_WORKER_NAME },
];

/**
 * Strip JSON-with-comments down to plain JSON so JSON.parse can handle it.
 * Handles both block and line comments. Does NOT handle trailing commas
 * (drizzle-kit / wrangler don't emit them in our templates).
 *
 * Scans rather than regex-replaces because a comment marker is only a comment
 * outside a string: `"https://unpkg.com/..."` and `"src/**\/*.ts"` are values,
 * and the previous regex truncated both, producing unparseable JSON from a
 * perfectly valid config.
 */
/** Index just past the string literal whose opening quote sits at `openQuote`. */
function endOfString(content: string, openQuote: number): number {
	let index = openQuote + 1;
	while (index < content.length) {
		// Skip escape pairs whole, so a `\"` never reads as the closing quote.
		if (content[index] === "\\") {
			index += 2;
			continue;
		}
		if (content[index] === '"') return index + 1;
		index += 1;
	}
	return index;
}

/** Index just past the comment starting at `start`, for either comment style. */
function endOfComment(content: string, start: number): number {
	if (content[start + 1] === "/") {
		const newline = content.indexOf("\n", start);
		return newline === -1 ? content.length : newline;
	}
	const close = content.indexOf("*/", start + 2);
	return close === -1 ? content.length : close + 2;
}

export function stripJsonc(content: string): string {
	let result = "";
	let index = 0;

	while (index < content.length) {
		const char = content[index] as string;

		if (char === '"') {
			const end = endOfString(content, index);
			result += content.slice(index, end);
			index = end;
			continue;
		}

		if (char === "/" && (content[index + 1] === "/" || content[index + 1] === "*")) {
			index = endOfComment(content, index);
			continue;
		}

		result += char;
		index += 1;
	}

	return result;
}

/**
 * Project names must be kebab-case: lowercase letters, digits, single dashes,
 * starting with a letter. Matches npm naming for non-scoped packages.
 */
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export function isValidProjectName(name: string): boolean {
	return KEBAB_CASE.test(name);
}

/**
 * Compute which required wrangler env blocks are missing from a parsed
 * wrangler.jsonc body. Separated from file IO so it can be unit-tested
 * against arbitrary content.
 */
export function missingWranglerEnvs(
	parsed: { env?: Record<string, unknown> } | null,
	required: readonly string[],
): string[] {
	const envs = parsed?.env ?? {};
	return required.filter((e) => !envs[e]);
}

/**
 * UX symbol for a step result. Consistent across the script output.
 */
export function symbolFor(result: RenameResult | FanoutResult): string {
	if (result === "renamed" || result === "copied") return "✓";
	if (result === "skipped") return "·";
	return "✗";
}
