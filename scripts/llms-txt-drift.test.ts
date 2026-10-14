/**
 * Drift test for the committed agent index.
 *
 * Regenerates llms.txt from the real `.claude/` tree and fails when the
 * committed copy no longer matches. Adding a rule, deleting one, or renaming
 * the project all turn this red — which is the point: the previous index was a
 * verbatim copy from a sibling template and nothing in the repo noticed.
 *
 * Run `pnpm gen:llms-txt` to fix a failure here. See issue #20.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderLlmsTxt } from "./llms-txt-source";

const ROOT = resolve(import.meta.dirname, "..");
const COMMITTED = readFileSync(resolve(ROOT, "llms.txt"), "utf8");

function ruleFiles(dir: string, prefix: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = `${prefix}${entry.name}`;
		if (entry.isDirectory()) return ruleFiles(join(dir, entry.name), `${path}/`);
		return entry.name.endsWith(".md") ? [path] : [];
	});
}

describe("llms.txt", () => {
	it("matches what the builder emits from the current tree", () => {
		expect(COMMITTED).toBe(renderLlmsTxt(ROOT));
	});

	it("names this project, not the template it was copied from", () => {
		const { name } = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
			name: string;
		};
		expect(COMMITTED.split("\n")[0]).toBe(`# ${name}`);
	});

	it("links every rule file in the tree", () => {
		const rules = ruleFiles(resolve(ROOT, ".claude", "rules"), ".claude/rules/");
		const missing = rules.filter((rule) => !COMMITTED.includes(`](${rule})`));
		expect(missing).toEqual([]);
	});

	it("links nothing that does not exist", () => {
		const links = [...COMMITTED.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1] as string);
		expect(links.length).toBeGreaterThan(0);
		expect(links.filter((link) => !existsSync(resolve(ROOT, link)))).toEqual([]);
	});

	it("is served from public/ without a second maintained copy", () => {
		const served = resolve(ROOT, "public", "llms.txt");
		expect(lstatSync(served).isSymbolicLink()).toBe(true);
		expect(realpathSync(served)).toBe(realpathSync(resolve(ROOT, "llms.txt")));
	});
});
