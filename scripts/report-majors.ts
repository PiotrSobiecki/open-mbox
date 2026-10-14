#!/usr/bin/env tsx
/**
 * Reports pending major upgrades into a single tracking issue (issue #27).
 *
 * The side-effecting half: it runs taze, asks GitHub what is already open, and
 * applies whatever `majors-report-lib.ts` decided. Every judgement — what counts as
 * a major, what the report says, whether to open, rewrite or do nothing — lives in
 * that module and is unit-tested there. This file is deliberately the part with no
 * decisions in it, because it is the part no unit test can reach.
 *
 * Run by `.github/workflows/majors-report.yml` on a schedule, and by hand with
 * `pnpm deps:major:report --dry-run`, which prints the report and touches nothing.
 *
 * It never writes package.json. Making a major visible and taking one are different
 * acts, and this job only does the first.
 */

import { execa } from "execa";
import {
	buildMajorsReport,
	decideReportAction,
	type ExistingIssue,
	MAJORS_ISSUE_LABEL,
	MAJORS_ISSUE_TITLE,
} from "./majors-report-lib";

const dryRun = process.argv.includes("--dry-run");

async function gh(args: string[], input?: string): Promise<string> {
	const { stdout } = await execa("gh", args, input === undefined ? {} : { input });
	return stdout;
}

/**
 * The open tracking issue, if there is one.
 *
 * Found by label rather than by title search: the search index lags issue creation
 * by minutes, and a lookup that misses opens a second issue — the exact duplication
 * this job exists to avoid. The label is created first so the filter cannot fail on
 * a repository that has never had one.
 */
async function findOpenReport(): Promise<ExistingIssue | undefined> {
	await gh([
		"label",
		"create",
		MAJORS_ISSUE_LABEL,
		"--description",
		"Pending major dependency upgrades, reported weekly",
		"--color",
		"5319E7",
		"--force",
	]);

	const found = JSON.parse(
		await gh([
			"issue",
			"list",
			"--state",
			"open",
			"--label",
			MAJORS_ISSUE_LABEL,
			"--json",
			"number,title,body",
			"--limit",
			"100",
		]),
	) as { number: number; title: string; body: string }[];

	return found.find((issue) => issue.title === MAJORS_ISSUE_TITLE);
}

const { stdout } = await execa("pnpm", ["exec", "taze", "-r", "major", "--json"], {
	env: { NO_COLOR: "1" },
});

const report = buildMajorsReport(stdout);

if (dryRun) {
	console.log(report.hasMajors ? report.body : "No pending major upgrades.");
	process.exit(0);
}

const action = decideReportAction(report, await findOpenReport());

switch (action.kind) {
	case "none":
		console.log(`✓ nothing to do — ${action.reason}`);
		break;
	case "create":
		await gh(
			[
				"issue",
				"create",
				"--title",
				action.title,
				"--label",
				MAJORS_ISSUE_LABEL,
				"--body-file",
				"-",
			],
			action.body,
		);
		console.log(`✓ opened "${action.title}"`);
		break;
	case "update":
		await gh(["issue", "edit", String(action.issue), "--body-file", "-"], action.body);
		console.log(`✓ rewrote issue #${action.issue} with the current list`);
		break;
}
