/**
 * Unit tests for the agent-index builder, exercised at its exported boundary
 * over a fixture tree — no filesystem, no real repo content.
 *
 * The defect that motivated generating this file was a whole-file copy from a
 * sibling template: wrong project name, wrong stack summary, and links to nine
 * rule files that never existed here. A link checker would have caught only the
 * last of those, which is why the index is built from the tree instead of
 * written by hand. See issue #20.
 */

import { buildLlmsTxt, type IndexFile } from "./llms-txt-lib";

const FIXTURE_FILES: IndexFile[] = [
	{
		path: "AGENTS.md",
		content: "# demo-app\n\nA demo project.\n\n## Stack\n\ntext\n\n## Commands\n\ntext\n",
	},
	{
		path: ".claude/rules/general.md",
		content: "# General Rules\n\n## Type Safety\n\ntext\n\n## Naming\n\ntext\n",
	},
	{
		path: ".claude/rules/api/endpoints.md",
		content: '---\npaths:\n  - "src/pages/api/**"\n---\n\n# API Endpoints\n\n## Handler shape\n',
	},
	{
		path: ".claude/agents/dd-w.md",
		content:
			"---\nname: dd-w\ndescription: Writes design documents. Also does other things entirely.\nmodel: opus\n---\n\nbody\n",
	},
	{
		path: ".claude/commands/implement.md",
		content: "Implement a design doc: $ARGUMENTS\n\n## Instructions\n\ntext\n",
	},
];

const INPUT = { projectName: "demo-app", summary: "A demo project.", files: FIXTURE_FILES };

describe("buildLlmsTxt", () => {
	const output = buildLlmsTxt(INPUT);

	it("titles the index with the project name", () => {
		expect(output.split("\n")[0]).toBe("# demo-app");
	});

	it("states the summary as the lede blockquote", () => {
		expect(output).toContain("> A demo project.");
	});

	it.each([
		["Project", "## Project"],
		["Rules", "## Rules"],
		["Agents", "## Agents"],
		["Commands", "## Commands"],
	])("emits the %s section", (_label, heading) => {
		expect(output).toContain(heading);
	});

	it("groups root-level rules under General and subdirectories under their own heading", () => {
		expect(output).toContain("### General");
		expect(output).toContain("### api");
	});

	it("links every file it was given", () => {
		for (const file of FIXTURE_FILES) {
			expect(output).toContain(`](${file.path})`);
		}
	});

	it("invents no link that was not in the input", () => {
		const linked = [...output.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
		const known = FIXTURE_FILES.map((file) => file.path);
		expect(linked.filter((link) => !known.includes(link as string))).toEqual([]);
	});

	it("takes a rule's title from its heading and its description from its sections", () => {
		expect(output).toContain("- [General Rules](.claude/rules/general.md): Type Safety, Naming");
	});

	it("strips frontmatter rather than leaking it into the index", () => {
		expect(output).toContain("- [API Endpoints](.claude/rules/api/endpoints.md): Handler shape");
		expect(output).not.toContain("src/pages/api/**");
	});

	it("takes an agent's title and one-line description from its frontmatter", () => {
		expect(output).toContain("- [dd-w](.claude/agents/dd-w.md): Writes design documents.");
		expect(output).not.toContain("Also does other things entirely.");
	});

	it("falls back to the filename when a document has no heading", () => {
		expect(output).toContain("- [implement](.claude/commands/implement.md):");
	});

	it("describes a command by what its first line says, not by its headings", () => {
		// "Instructions" is the only heading these carry and says nothing useful.
		expect(output).toContain(
			"- [implement](.claude/commands/implement.md): Implement a design doc: $ARGUMENTS",
		);
	});

	it("reflects a rule added to the tree", () => {
		const added: IndexFile = {
			path: ".claude/rules/testing.md",
			content: "# Testing\n\n## Vitest\n",
		};
		const next = buildLlmsTxt({ ...INPUT, files: [...FIXTURE_FILES, added] });
		expect(next).toContain("- [Testing](.claude/rules/testing.md): Vitest");
	});

	it("drops a rule removed from the tree", () => {
		const remaining = FIXTURE_FILES.filter((file) => file.path !== ".claude/rules/general.md");
		const next = buildLlmsTxt({ ...INPUT, files: remaining });
		expect(next).not.toContain(".claude/rules/general.md");
	});

	it("is deterministic regardless of input order", () => {
		const reversed = buildLlmsTxt({ ...INPUT, files: [...FIXTURE_FILES].reverse() });
		expect(reversed).toBe(output);
	});

	it("ends with exactly one trailing newline", () => {
		expect(output.endsWith("\n")).toBe(true);
		expect(output.endsWith("\n\n")).toBe(false);
	});
});
