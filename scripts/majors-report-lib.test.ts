/**
 * Unit test for the major-upgrade reporter's pure half (issue #27).
 *
 * The fixture below is real `taze -r major --json` output, trimmed to one entry
 * per source and per diff kind. That is deliberate: this test is the thing that
 * fails when taze changes its output shape, and a hand-invented fixture would
 * keep passing while production started reporting nothing. The failure mode being
 * guarded is specific — an automation that quietly files empty issues, or files
 * none at all, is worse than no automation, because it looks like good news.
 *
 * The decision half is here too. Whether a run opens an issue, rewrites one, or
 * does nothing is a rule, not an effect, so it is tested as one; `report-majors.ts`
 * is left with the IO it cannot avoid.
 */

import {
	buildMajorsReport,
	decideReportAction,
	MAJORS_ISSUE_TITLE,
	MajorsReportFormatError,
} from "./majors-report-lib";

/** Real output. Only the entry list is trimmed. */
const TAZE_JSON = `{
  "packages": [
    {
      "name": "astro-on-cf",
      "type": "package.json",
      "filepath": "/repo/package.json",
      "relative": "package.json",
      "resolved": [
        {
          "name": "astro",
          "source": "dependencies",
          "currentVersion": "^6.4.8",
          "targetVersion": "^7.2.0",
          "diff": "major",
          "update": true,
          "currentVersionTime": "2026-06-17T14:10:17.853Z",
          "targetVersionTime": "2026-08-06T10:48:55.757Z"
        },
        {
          "name": "typescript",
          "source": "devDependencies",
          "currentVersion": "^5.9.3",
          "targetVersion": "^7.0.2",
          "diff": "major",
          "update": true,
          "currentVersionTime": "2025-10-01T10:00:00.000Z",
          "targetVersionTime": "2026-07-01T10:00:00.000Z"
        },
        {
          "name": "pnpm",
          "source": "packageManager",
          "currentVersion": "^10.34.5",
          "targetVersion": "^11.20.0",
          "diff": "major",
          "update": true,
          "currentVersionTime": "2026-07-10T10:00:00.000Z",
          "targetVersionTime": "2026-08-03T10:00:00.000Z"
        },
        {
          "name": "vite",
          "source": "overrides",
          "currentVersion": "^7.3.6",
          "targetVersion": "^8.2.1",
          "diff": "major",
          "update": true,
          "currentVersionTime": "2026-07-02T10:00:00.000Z",
          "targetVersionTime": "2026-08-05T10:00:00.000Z"
        },
        {
          "name": "wrangler",
          "source": "devDependencies",
          "currentVersion": "^4.118.0",
          "targetVersion": "^4.120.0",
          "diff": "minor",
          "update": true,
          "currentVersionTime": "2026-07-30T10:00:00.000Z",
          "targetVersionTime": "2026-08-07T10:00:00.000Z"
        },
        {
          "name": "tsx",
          "source": "devDependencies",
          "currentVersion": "^4.23.5",
          "targetVersion": "^4.23.11",
          "diff": "patch",
          "update": true,
          "currentVersionTime": "2026-08-01T10:00:00.000Z",
          "targetVersionTime": "2026-08-07T10:00:00.000Z"
        }
      ]
    }
  ]
}`;

/** The same run against a repository with nothing outdated: taze resolves nothing. */
const TAZE_JSON_UP_TO_DATE = `{
  "packages": [
    {
      "name": "astro-on-cf",
      "type": "package.json",
      "filepath": "/repo/package.json",
      "relative": "package.json",
      "resolved": []
    }
  ]
}`;

/** Updates exist, but none of them crosses a major. */
const TAZE_JSON_MINORS_ONLY = TAZE_JSON.replace(/"diff": "major"/g, '"diff": "minor"');

const MAJORS = buildMajorsReport(TAZE_JSON);

describe("buildMajorsReport", () => {
	describe("with pending majors", () => {
		it("reports that it has some", () => {
			expect(MAJORS.hasMajors).toBe(true);
		});

		it("collects every major and nothing below one", () => {
			if (!MAJORS.hasMajors) throw new Error("expected pending majors");

			expect(MAJORS.upgrades.map((upgrade) => upgrade.name)).toEqual([
				"astro",
				"pnpm",
				"typescript",
				"vite",
			]);
		});

		it("carries the version range each upgrade moves between", () => {
			if (!MAJORS.hasMajors) throw new Error("expected pending majors");

			expect(MAJORS.upgrades).toContainEqual({
				name: "astro",
				source: "dependencies",
				from: "^6.4.8",
				to: "^7.2.0",
			});
		});

		it("names every upgrade in the body", () => {
			if (!MAJORS.hasMajors) throw new Error("expected pending majors");

			for (const upgrade of MAJORS.upgrades) {
				expect(MAJORS.body).toContain(upgrade.name);
				expect(MAJORS.body).toContain(upgrade.to);
			}
		});

		it("names nothing that is not a major, so the report stays actionable", () => {
			if (!MAJORS.hasMajors) throw new Error("expected pending majors");

			expect(MAJORS.body).not.toContain("wrangler");
			expect(MAJORS.body).not.toContain("tsx");
		});

		it("states how many there are, so the issue title's promise is checkable", () => {
			if (!MAJORS.hasMajors) throw new Error("expected pending majors");

			expect(MAJORS.body).toContain("4");
		});

		it("is deterministic — the same output produces byte-identical bodies", () => {
			const again = buildMajorsReport(TAZE_JSON);

			expect(again.hasMajors && again.body).toBe(MAJORS.hasMajors && MAJORS.body);
		});

		it("orders upgrades independently of the order taze listed them", () => {
			const parsed = JSON.parse(TAZE_JSON) as { packages: { resolved: unknown[] }[] };
			const first = parsed.packages[0] as { resolved: unknown[] };
			first.resolved = [...first.resolved].reverse();

			const reversed = buildMajorsReport(JSON.stringify(parsed));

			expect(reversed.hasMajors && reversed.body).toBe(MAJORS.hasMajors && MAJORS.body);
		});
	});

	describe("with no pending majors", () => {
		it.each([
			["nothing is outdated at all", TAZE_JSON_UP_TO_DATE],
			["everything outdated is a minor", TAZE_JSON_MINORS_ONLY],
		])("reports none when %s", (_case, output) => {
			expect(buildMajorsReport(output).hasMajors).toBe(false);
		});
	});

	describe("when the tool's output stops looking like itself", () => {
		it.each([
			["the table output taze prints without --json", "  dependencies\n    astro  ^6.4.8 → ^7.2.0"],
			["empty output", ""],
			["a JSON document of another shape", '{"dependencies": {"astro": "^7.2.0"}}'],
			["no packages at all, which would silently report nothing", '{"packages": []}'],
			[
				"a renamed field",
				TAZE_JSON.replace(/"diff":/g, '"change":').replace(/"targetVersion":/g, '"nextVersion":'),
			],
			["a version field that is no longer a string", TAZE_JSON.replace(/"\^6\.4\.8"/, "6.48")],
		])("fails loudly on %s rather than reporting no majors", (_case, output) => {
			expect(() => buildMajorsReport(output)).toThrow(MajorsReportFormatError);
		});

		it("tolerates fields taze adds later, which are not a format break", () => {
			const extended = TAZE_JSON.replace(/"diff": "major"/g, '"diff": "major", "maturity": 7');

			expect(buildMajorsReport(extended).hasMajors).toBe(true);
		});
	});
});

describe("decideReportAction", () => {
	const NONE = buildMajorsReport(TAZE_JSON_UP_TO_DATE);
	const body = MAJORS.hasMajors ? MAJORS.body : "";

	it("opens one issue the first time majors appear", () => {
		expect(decideReportAction(MAJORS, undefined)).toStrictEqual({
			kind: "create",
			title: MAJORS_ISSUE_TITLE,
			body,
		});
	});

	it("rewrites the same issue afterwards rather than opening a second", () => {
		const action = decideReportAction(MAJORS, { number: 42, body: "an older report" });

		expect(action).toStrictEqual({ kind: "update", issue: 42, body });
	});

	it("does nothing when the open issue already says exactly this", () => {
		expect(decideReportAction(MAJORS, { number: 42, body }).kind).toBe("none");
	});

	it("opens nothing when there are no majors", () => {
		expect(decideReportAction(NONE, undefined).kind).toBe("none");
	});

	it("leaves an existing issue untouched when there are no majors", () => {
		expect(decideReportAction(NONE, { number: 42, body: "an older report" }).kind).toBe("none");
	});

	it("explains every decision to do nothing, so a quiet run is still readable", () => {
		const action = decideReportAction(NONE, { number: 42, body: "an older report" });

		expect(action.kind === "none" && action.reason.length).toBeGreaterThan(0);
	});
});
