/**
 * Contract test for package.json `scripts.prepare`.
 *
 * `prepare` runs automatically after `pnpm install`. It must:
 *   1. install git hooks via simple-git-hooks (keeps pre-commit/pre-push wired)
 *   2. generate worker-configuration.d.ts via wrangler types (keeps Env types
 *      resolvable on a fresh clone — see issue #3)
 *
 * Locking these into a test prevents regressions where someone refactors
 * prepare and silently breaks the post-install bootstrap.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(
	readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

describe("package.json scripts.prepare", () => {
	const prepare = packageJson.scripts?.prepare;

	it("is defined", () => {
		expect(prepare).toBeDefined();
	});

	it("runs simple-git-hooks so pre-commit and pre-push hooks stay installed", () => {
		expect(prepare).toMatch(/simple-git-hooks/);
	});

	it("runs wrangler types so worker-configuration.d.ts is generated on install", () => {
		expect(prepare).toMatch(/wrangler types/);
	});
});
