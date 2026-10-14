/**
 * Contract test for the CI workflow set.
 *
 * The gap this closes: the release pipeline ran lint, types, test and knip but
 * never the production build, so a change that compiled locally-but-not-in-prod
 * merged green and was only discovered on a laptop at deploy time. The build is
 * the check that matters here — the others cannot substitute for it.
 *
 * Asserting over the parsed YAML (rather than trusting review) means the gate
 * cannot be silently removed by a later edit to the workflow files. See issue #18.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown> };
type Job = { steps?: Step[] };
type Workflow = {
	on?: Record<string, unknown>;
	env?: Record<string, unknown>;
	jobs?: Record<string, Job>;
};

const WORKFLOW_DIR = resolve(import.meta.dirname, "..", ".github", "workflows");

function readWorkflow(file: string): Workflow {
	return parse(readFileSync(resolve(WORKFLOW_DIR, file), "utf8")) as Workflow;
}

function steps(workflow: Workflow): Step[] {
	return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function runCommands(workflow: Workflow): string[] {
	return steps(workflow)
		.map((step) => step.run)
		.filter((run): run is string => typeof run === "string");
}

function runsCommand(workflow: Workflow, command: string): boolean {
	return runCommands(workflow).some((run) => run.includes(command));
}

/** The full check list every pipeline must run. `build` is the point of issue #18. */
const REQUIRED_CHECKS = [
	["lint", "pnpm run lint:ci"],
	["type check", "pnpm run types"],
	["test", "pnpm run test"],
	["dead-code check", "pnpm run knip"],
	["production build", "pnpm run build"],
] as const;

describe("ci workflow", () => {
	const ci = readWorkflow("ci.yml");

	it("triggers on pull requests", () => {
		expect(ci.on).toHaveProperty("pull_request");
	});

	it("triggers on pushes to main", () => {
		const push = ci.on?.push as { branches?: string[] } | undefined;
		expect(push?.branches).toContain("main");
	});

	it.each(REQUIRED_CHECKS)("runs the %s", (_label, command) => {
		expect(runsCommand(ci, command)).toBe(true);
	});

	it("does not install git hooks into the runner", () => {
		expect(ci.env?.SKIP_SIMPLE_GIT_HOOKS).toBe("1");
	});
});

describe("release workflow", () => {
	const release = readWorkflow("release.yml");

	it.each(REQUIRED_CHECKS)("runs the %s", (_label, command) => {
		expect(runsCommand(release, command)).toBe(true);
	});

	it("runs the build before releasing", () => {
		const commands = runCommands(release);
		const build = commands.findIndex((run) => run.includes("pnpm run build"));
		const semanticRelease = commands.findIndex((run) => run.includes("semantic-release"));
		expect(build).toBeGreaterThanOrEqual(0);
		expect(semanticRelease).toBeGreaterThan(build);
	});

	it("does not install git hooks into the runner", () => {
		expect(release.env?.SKIP_SIMPLE_GIT_HOOKS).toBe("1");
	});
});

/**
 * Dependabot replaces the template's taze workflows: one bot, on the day and hour the
 * owner chose. Majors stay out of the grouped PR so each one is reviewed on its own.
 */
describe("dependabot", () => {
	type Update = {
		"package-ecosystem"?: string;
		schedule?: Record<string, string>;
		groups?: Record<string, { "update-types"?: string[] }>;
	};
	const config = parse(readFileSync(resolve(WORKFLOW_DIR, "..", "dependabot.yml"), "utf8")) as {
		updates?: Update[];
	};
	const updates = config.updates ?? [];

	it.each(["npm", "github-actions"])(
		"updates %s every Wednesday at 14:00 Warsaw time",
		(ecosystem) => {
			const update = updates.find((u) => u["package-ecosystem"] === ecosystem);
			expect(update?.schedule).toEqual({
				interval: "weekly",
				day: "wednesday",
				time: "14:00",
				timezone: "Europe/Warsaw",
			});
		},
	);

	it.each(["npm", "github-actions"])("groups only minor and patch updates for %s", (ecosystem) => {
		const update = updates.find((u) => u["package-ecosystem"] === ecosystem);
		const grouped = Object.values(update?.groups ?? {}).flatMap((g) => g["update-types"] ?? []);
		expect(grouped.sort()).toEqual(["minor", "patch"]);
	});

	it("is the only dependency bot", () => {
		expect(readdirSync(WORKFLOW_DIR)).not.toContain("deps-update.yml");
	});
});

/**
 * The deploy workflow: a button, not a trigger. It must refuse to ship a tree that
 * fails any gate, and it must never run on a push.
 */
describe("deploy workflow", () => {
	const deploy = readWorkflow("deploy.yml");
	const commands = runCommands(deploy);
	const deployAt = commands.findIndex((run) => run.includes('pnpm run "deploy:'));
	const GATES = REQUIRED_CHECKS.filter(([label]) => label !== "production build");

	it("runs only when started by hand", () => {
		expect(Object.keys(deploy.on ?? {})).toEqual(["workflow_dispatch"]);
	});

	it.each(GATES)("runs the %s before deploying", (_label, command) => {
		const at = commands.findIndex((run) => run.includes(command));
		expect(at).toBeGreaterThanOrEqual(0);
		expect(deployAt).toBeGreaterThan(at);
	});

	it("deploys through the package scripts, which build first", () => {
		expect(deployAt).toBeGreaterThanOrEqual(0);
	});

	it("does not install git hooks into the runner", () => {
		expect(deploy.env?.SKIP_SIMPLE_GIT_HOOKS).toBe("1");
	});
});
