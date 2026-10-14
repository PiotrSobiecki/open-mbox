/**
 * Pure half of the major-upgrade reporter (issue #27).
 *
 * The weekly dependency bot runs in minor mode, so majors — Astro 7, the adapter,
 * the compiler, the linter — never appear in a pull request and accumulate where
 * nobody is looking. This module turns one `taze -r major --json` run into a report
 * body, and decides what should happen to the tracking issue. `report-majors.ts`
 * does the running and the GitHub calls; nothing here touches either, which is what
 * lets both halves be tested from a string.
 *
 * **Why the JSON output and not the table.** The table is formatted for a terminal:
 * columns move, colours come and go, and a parser over it fails silently — reporting
 * zero majors, which reads exactly like good news. The JSON output is a contract,
 * and a broken contract throws here instead. That distinction is the whole point of
 * the phase: an automation that quietly files empty issues reproduces the
 * invisibility it was built to fix.
 *
 * **Why the body is deterministic.** No dates, no counts of anything that moves on
 * its own, upgrades sorted by name. A run whose findings have not changed produces
 * a byte-identical body, and `decideReportAction` turns that into no edit at all —
 * so the issue's timeline records real changes rather than the automation's pulse.
 */

import { z } from "zod";

/** The title the tracking issue is found by. Changing it orphans the open one. */
export const MAJORS_ISSUE_TITLE = "chore(deps): pending major upgrades";

/** The label the reporter creates and filters on, so the lookup needs no search index. */
export const MAJORS_ISSUE_LABEL = "major-upgrades";

/** Raised when taze's output is not the shape this module knows how to read. */
export class MajorsReportFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MajorsReportFormatError";
	}
}

/**
 * What taze emits, narrowed to the fields this report needs.
 *
 * Unknown keys are stripped rather than rejected, so a field taze adds later is not
 * a format break — but a field it renames or retypes is, and that is the failure
 * this schema exists to make loud. `packages` must be non-empty for the same reason:
 * a run that resolved no manifest at all found no majors only in the sense that it
 * looked nowhere.
 */
const TazeOutput = z.object({
	packages: z
		.object({
			relative: z.string(),
			resolved: z.array(
				z.object({
					name: z.string(),
					source: z.string(),
					currentVersion: z.string(),
					targetVersion: z.string(),
					diff: z.string().nullable(),
					update: z.boolean(),
				}),
			),
		})
		.array()
		.min(1),
});

export interface MajorUpgrade {
	readonly name: string;
	/** `dependencies`, `devDependencies`, `packageManager`, `overrides`. */
	readonly source: string;
	readonly from: string;
	readonly to: string;
}

export type MajorsReport =
	| { readonly hasMajors: false }
	| { readonly hasMajors: true; readonly upgrades: readonly MajorUpgrade[]; readonly body: string };

export interface ExistingIssue {
	readonly number: number;
	readonly body: string;
}

export type ReportAction =
	| { readonly kind: "none"; readonly reason: string }
	| { readonly kind: "create"; readonly title: string; readonly body: string }
	| { readonly kind: "update"; readonly issue: number; readonly body: string };

function parseTazeOutput(output: string): z.infer<typeof TazeOutput> {
	let json: unknown;
	try {
		json = JSON.parse(output);
	} catch {
		// The most likely cause by far: --json was dropped and this is the table.
		throw new MajorsReportFormatError(
			`taze produced no JSON document. First 200 characters: ${output.slice(0, 200) || "(empty)"}`,
		);
	}

	const parsed = TazeOutput.safeParse(json);
	if (!parsed.success) {
		throw new MajorsReportFormatError(
			`taze's JSON no longer matches the shape this report reads:\n${z.prettifyError(parsed.error)}`,
		);
	}

	return parsed.data;
}

function renderBody(upgrades: readonly MajorUpgrade[]): string {
	const rows = upgrades
		.map(({ name, source, from, to }) => `| \`${name}\` | ${source} | \`${from}\` | \`${to}\` |`)
		.join("\n");

	return [
		`\`taze -r major --json\` finds **${upgrades.length}** major upgrade${
			upgrades.length === 1 ? "" : "s"
		} this repository has not taken.`,
		"",
		"| Package | Where | From | To |",
		"| --- | --- | --- | --- |",
		rows,
		"",
		"The weekly dependency job runs in minor mode on purpose: a major is a decision,",
		"not a bump. Take one with `pnpm deps:major:update` — or by editing the range by",
		"hand — and run `pnpm lint`, `pnpm types`, `pnpm test`, `pnpm knip` and",
		"`pnpm build` before merging it.",
		"",
		"This issue is rewritten in place on every run, so it is always the current list",
		"rather than one of many. A run that finds no majors leaves it exactly as it is;",
		"closing it is a human decision.",
		"",
	].join("\n");
}

/**
 * Turn one taze run into a report.
 *
 * Throws `MajorsReportFormatError` when the output cannot be read — never returns
 * an empty report to mean "could not tell".
 */
export function buildMajorsReport(tazeJson: string): MajorsReport {
	const { packages } = parseTazeOutput(tazeJson);

	const upgrades = packages
		.flatMap((pkg) => pkg.resolved)
		.filter((entry) => entry.update && entry.diff === "major")
		.map(
			(entry): MajorUpgrade => ({
				name: entry.name,
				source: entry.source,
				from: entry.currentVersion,
				to: entry.targetVersion,
			}),
		)
		.sort((left, right) => left.name.localeCompare(right.name));

	if (upgrades.length === 0) return { hasMajors: false };

	return { hasMajors: true, upgrades, body: renderBody(upgrades) };
}

/**
 * What this run should do to the tracking issue.
 *
 * One issue, opened once and rewritten thereafter. Filing a fresh issue every week
 * would make the report noise people learn to scroll past, which is the same
 * invisibility the job was added to fix, wearing a different mask.
 */
export function decideReportAction(
	report: MajorsReport,
	existing: ExistingIssue | undefined,
): ReportAction {
	if (!report.hasMajors) {
		return {
			kind: "none",
			reason: existing
				? `no pending majors — issue #${existing.number} left untouched`
				: "no pending majors",
		};
	}

	if (!existing) {
		return { kind: "create", title: MAJORS_ISSUE_TITLE, body: report.body };
	}

	if (existing.body.trim() === report.body.trim()) {
		return { kind: "none", reason: `issue #${existing.number} already says exactly this` };
	}

	return { kind: "update", issue: existing.number, body: report.body };
}
