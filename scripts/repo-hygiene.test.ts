/**
 * Contract test for repository hygiene (issue #23).
 *
 * Four independent defects share one verification — a clean working tree and a
 * green toolchain — so they share one test file:
 *
 * 1. **A tracked generated file.** `worker-configuration.d.ts` was committed *and*
 *    listed in `.gitignore`. An ignore entry does nothing to an already-tracked
 *    path, so the repository stated two contradictory intents and every dependency
 *    bump landed a half-megabyte diff. `prepare` already regenerates it, so
 *    untracking costs a fresh clone nothing.
 * 2. **A split Node major.** The declared floor and `@types/node` named one major
 *    while CI resolved `lts/*`, which was a different one — the template scaffolded
 *    onto a runtime the tests never exercised.
 * 3. **An exact linter pin.** Pinned to a single patch, the weekly bot could never
 *    move it while every other dependency tracked.
 * 4. **A stale dead-code ignore.** `ignoreDependencies` named a package copied from
 *    a sibling template that this repository has never depended on.
 *
 * This test reads repository state rather than application logic, so it shells out
 * to git — tracked-ness is a fact only git holds — and parses the workflow YAML the
 * same way `ci-workflow.test.ts` does.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { stripJsonc } from "./init-project-lib";

const ROOT = resolve(import.meta.dirname, "..");
const GENERATED_TYPES = "worker-configuration.d.ts";

type PackageJson = {
	engines?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as PackageJson;

const knipConfig = JSON.parse(stripJsonc(readFileSync(resolve(ROOT, "knip.jsonc"), "utf8"))) as {
	ignoreDependencies?: string[];
};

function git(...args: string[]): { status: number; stdout: string } {
	const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
	return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

/** The leading major of a semver range — `^24.9.2`, `>=24.0.0` and `24` all give 24. */
function majorOf(range: string): number {
	return Number(range.match(/(\d+)/)?.[1] ?? Number.NaN);
}

type Step = { uses?: string; with?: Record<string, unknown> };
type Workflow = { jobs?: Record<string, { steps?: Step[] }> };

const WORKFLOW_DIR = resolve(ROOT, ".github", "workflows");
const WORKFLOWS = readdirSync(WORKFLOW_DIR).filter((file) => file.endsWith(".yml"));

/** Every `node-version` the workflow hands to actions/setup-node. */
function nodeVersionsIn(file: string): string[] {
	const workflow = parse(readFileSync(resolve(WORKFLOW_DIR, file), "utf8")) as Workflow;
	return Object.values(workflow.jobs ?? {})
		.flatMap((job) => job.steps ?? [])
		.filter((step) => step.uses?.startsWith("actions/setup-node"))
		.map((step) => String(step.with?.["node-version"] ?? ""));
}

describe("generated Cloudflare types", () => {
	it("are not tracked, so a dependency bump lands no generated diff", () => {
		expect(git("ls-files", "--", GENERATED_TYPES).stdout.trim()).toBe("");
	});

	it("are ignored, so the ignore entry does something rather than nothing", () => {
		expect(git("check-ignore", "--", GENERATED_TYPES).status).toBe(0);
	});

	it("leave the working tree clean when regenerated", () => {
		expect(git("status", "--porcelain", "--", GENERATED_TYPES).stdout.trim()).toBe("");
	});

	it("are regenerated on install, so a fresh clone needs no manual step", () => {
		const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
			scripts?: Record<string, string>;
		};
		expect(pkg.scripts?.prepare).toMatch(/wrangler types/);
	});
});

describe("Node major", () => {
	const declaredMajor = majorOf(packageJson.engines?.node ?? "");

	it("is declared as a runtime floor", () => {
		expect(Number.isNaN(declaredMajor)).toBe(false);
	});

	it("matches the @types/node major", () => {
		expect(majorOf(packageJson.devDependencies?.["@types/node"] ?? "")).toBe(declaredMajor);
	});

	it.each(WORKFLOWS)("matches the version %s resolves", (file) => {
		const versions = nodeVersionsIn(file);
		expect(versions.length).toBeGreaterThan(0);
		expect(versions.map(majorOf)).toEqual(versions.map(() => declaredMajor));
	});
});

describe("dependency ranges", () => {
	const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };

	it.each(Object.entries(declared))("%s tracks a range the weekly bot can move", (_name, range) => {
		expect(range).toMatch(/^[\^~]/);
	});
});

/**
 * Names knip reports as unlisted dependencies that are not packages at all, but
 * runtime module namespaces — `cloudflare:workers` resolves to "cloudflare".
 *
 * The audit read the `cloudflare` entry as a leftover copied from a sibling
 * template. It is not: that entry and the first `cloudflare:workers` import landed
 * in the same commit, and deleting it turns knip red on two live imports. So the
 * entry stays and the invariant moves one level down — an ignored namespace must
 * still have a source file importing from it. That is what makes a genuinely stale
 * entry fail instead of linger, which is what the ignore-hygiene rule was after.
 */
const RUNTIME_NAMESPACES = ["cloudflare"];

const SOURCE_FILES = readdirSync(resolve(ROOT, "src"), { recursive: true, withFileTypes: true })
	.filter((entry) => entry.isFile())
	.map((entry) => resolve(entry.parentPath, entry.name));

function filesImporting(namespace: string): string[] {
	return SOURCE_FILES.filter((file) => readFileSync(file, "utf8").includes(`"${namespace}:`));
}

describe("dead-code configuration", () => {
	const declared = new Set([
		...Object.keys(packageJson.dependencies ?? {}),
		...Object.keys(packageJson.devDependencies ?? {}),
	]);
	const ignored = knipConfig.ignoreDependencies ?? [];
	const packages = ignored.filter((name) => !RUNTIME_NAMESPACES.includes(name));
	const namespaces = ignored.filter((name) => RUNTIME_NAMESPACES.includes(name));

	it("ignores something, so the checks below are not vacuous", () => {
		expect(ignored.length).toBeGreaterThan(0);
	});

	it.each(packages)("ignores %s only because this repository declares it", (name) => {
		expect([...declared]).toContain(name);
	});

	it.each(namespaces)("ignores the %s: namespace only while something imports it", (name) => {
		expect(declared.has(name)).toBe(false);
		expect(filesImporting(name)).not.toEqual([]);
	});
});
