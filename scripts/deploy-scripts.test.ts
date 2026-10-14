/**
 * Contract test for the deploy script surface.
 *
 * Two defects this locks out, both silent:
 *
 *   1. `deploy` is a pnpm built-in (workspace deploy), so `pnpm deploy` never
 *      reaches a script of that name — the documented command simply errored.
 *   2. The obvious workaround, `wrangler deploy` with no `--env`, succeeds and
 *      publishes to the *top-level* Worker, which none of the three declared
 *      environment blocks owns. That is a fourth live Worker nobody manages and
 *      nothing in the repo mentions.
 *
 * Every deploy path must therefore name its environment, and that environment
 * must be declared in wrangler.jsonc. See issue #19.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripJsonc } from "./init-project-lib";

const ROOT = resolve(import.meta.dirname, "..");

function read(file: string): string {
	return readFileSync(resolve(ROOT, file), "utf8");
}

const scripts =
	(JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts ?? {};

const wranglerEnvs = Object.keys(
	(JSON.parse(stripJsonc(read("wrangler.jsonc"))) as { env?: Record<string, unknown> }).env ?? {},
);

/** Scripts that shell out to `wrangler deploy`, by name. */
const deployScripts = Object.entries(scripts).filter(([, command]) =>
	/\bwrangler deploy\b/.test(command),
);

/**
 * pnpm commands that take precedence over a same-named package script, from
 * `pnpm --help` on pnpm 12. `test`, `run`, `start`, `stop`, `restart`, `clean`
 * and `purge` are deliberately absent: pnpm forwards those to the script of the
 * same name rather than shadowing it. `deploy` shadows only inside a workspace,
 * which this repo is (`pnpm-workspace.yaml`). Aliases (`i`, `ls`, `rm`, …) are
 * not listed.
 */
const SHADOWED_BY_PNPM = [
	"access",
	"add",
	"approve-builds",
	"audit",
	"bin",
	"bugs",
	"cache",
	"cat-file",
	"cat-index",
	"change",
	"ci",
	"completion",
	"config",
	"create",
	"dedupe",
	"deploy",
	"deprecate",
	"dist-tag",
	"dlx",
	"docs",
	"doctor",
	"edit",
	"env",
	"exec",
	"fetch",
	"find-hash",
	"get",
	"ignored-builds",
	"import",
	"init",
	"install",
	"install-test",
	"lane",
	"licenses",
	"link",
	"list",
	"ll",
	"login",
	"logout",
	"outdated",
	"owner",
	"pack",
	"pack-app",
	"patch",
	"patch-commit",
	"patch-remove",
	"peers",
	"ping",
	"pipeline",
	"pkg",
	"prefix",
	"profile",
	"prune",
	"publish",
	"rebuild",
	"recursive",
	"remove",
	"repo",
	"root",
	"runtime",
	"sbom",
	"search",
	"self-update",
	"set",
	"set-script",
	"setup",
	"shim",
	"stage",
	"star",
	"stars",
	"store",
	"team",
	"token",
	"undeprecate",
	"unlink",
	"unpublish",
	"unstar",
	"update",
	"version",
	"view",
	"whoami",
	"why",
	"with",
	"xmas",
];

describe("package.json deploy scripts", () => {
	it("defines a staging deploy command", () => {
		expect(scripts["deploy:staging"]).toBeDefined();
	});

	it("defines a production deploy command", () => {
		expect(scripts["deploy:production"]).toBeDefined();
	});

	it("defines at least one deploy script", () => {
		expect(deployScripts.length).toBeGreaterThan(0);
	});

	it("names an environment explicitly in every deploy script", () => {
		const bare = deployScripts.filter(([, command]) => !/--env[= ]\S+/.test(command));
		expect(bare).toEqual([]);
	});

	it("targets only environments declared in wrangler.jsonc", () => {
		const targeted = deployScripts.map(([name, command]) => {
			const match = command.match(/--env[= ](\S+)/);
			return [name, match?.[1]] as const;
		});
		const undeclared = targeted.filter(([, env]) => !env || !wranglerEnvs.includes(env));
		expect(undeclared).toEqual([]);
	});

	it("defines no script whose name a pnpm built-in command would shadow", () => {
		const shadowed = Object.keys(scripts).filter((name) => SHADOWED_BY_PNPM.includes(name));
		expect(shadowed).toEqual([]);
	});
});

describe("documented deploy commands", () => {
	const DOCS = ["README.md", "AGENTS.md"] as const;

	it.each(DOCS)("%s invokes only deploy scripts that exist", (doc) => {
		const invoked = [...read(doc).matchAll(/\bpnpm (?:run )?([\w:.-]+)/g)]
			.map((match) => match[1] as string)
			.filter((name) => name.includes("deploy"));
		const missing = invoked.filter((name) => !scripts[name]);
		expect(missing).toEqual([]);
	});

	it.each(DOCS)("%s never prints a wrangler deploy without an environment", (doc) => {
		const bare = [...read(doc).matchAll(/wrangler deploy(?<rest>[^\n`]*)/g)].filter(
			(match) => !/--env[= ]\S+/.test(match.groups?.rest ?? ""),
		);
		expect(bare.map((match) => match[0])).toEqual([]);
	});
});
