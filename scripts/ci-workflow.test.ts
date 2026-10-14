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

import { readFileSync } from "node:fs";
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

describe("deps-update workflow", () => {
	const deps = readWorkflow("deps-update.yml");

	it.each(REQUIRED_CHECKS)("validates the bump with the %s", (_label, command) => {
		expect(runsCommand(deps, command)).toBe(true);
	});

	it("opens its pull request with a token that can trigger CI", () => {
		// GitHub deliberately suppresses workflow runs for events raised by the
		// default GITHUB_TOKEN, so a bot PR authenticated with it alone shows no
		// checks. A PAT falls back to GITHUB_TOKEN when unset, keeping the
		// workflow functional on a fresh clone that has not created one.
		const openPr = steps(deps).find((step) =>
			step.uses?.startsWith("peter-evans/create-pull-request"),
		);
		expect(String(openPr?.with?.token)).toMatch(/secrets\.DEPS_UPDATE_TOKEN/);
	});

	it("does not install git hooks into the runner", () => {
		expect(deps.env?.SKIP_SIMPLE_GIT_HOOKS).toBe("1");
	});
});

/**
 * The majors-report workflow (issue #27).
 *
 * It exists because the weekly bot runs in minor mode, so majors accumulate where
 * nobody looks. Two properties are asserted rather than reviewed: it runs on a
 * schedule, and it *reports* — a step that wrote package.json would turn a
 * surfacing job into an unreviewed upgrade, which is the one thing the phase
 * promised not to do.
 */
describe("majors-report workflow", () => {
	const majors = readWorkflow("majors-report.yml");
	const commands = runCommands(majors);

	it("runs on a schedule, so majors surface without anyone remembering to look", () => {
		const schedule = majors.on?.schedule as { cron?: string }[] | undefined;
		expect(schedule?.[0]?.cron).toBeTruthy();
	});

	it("can also be run by hand, so the report is reproducible on demand", () => {
		expect(majors.on).toHaveProperty("workflow_dispatch");
	});

	it("may write issues, and only issues", () => {
		const permissions = (majors as { permissions?: Record<string, string> }).permissions;
		expect(permissions?.issues).toBe("write");
		expect(permissions?.contents).toBe("read");
	});

	it("runs the reporter", () => {
		expect(runsCommand(majors, "deps:major:report")).toBe(true);
	});

	it("performs no upgrade — this job makes majors visible, it does not take them", () => {
		const writes = commands.filter((run) =>
			/deps:major:update|deps:update|taze[^\n]*(-w\b|--write)/.test(run),
		);
		expect(writes).toEqual([]);
	});

	it("opens no pull request, since there is no change to propose", () => {
		expect(steps(majors).filter((step) => step.uses?.includes("create-pull-request"))).toEqual([]);
	});

	it("does not install git hooks into the runner", () => {
		expect(majors.env?.SKIP_SIMPLE_GIT_HOOKS).toBe("1");
	});
});
