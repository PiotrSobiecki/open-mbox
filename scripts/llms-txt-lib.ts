/**
 * Pure builder for the agent index (llms.txt).
 *
 * Takes the documents that make up the index and returns the finished markdown.
 * Nothing here touches the filesystem — `llms-txt-source.ts` reads the tree and
 * `generate-llms-txt.ts` writes the result, so this module stays testable
 * against a fixture tree (see llms-txt-lib.test.ts).
 *
 * The index is generated rather than written because the file it replaced was a
 * verbatim copy from a sibling template: wrong project, wrong stack, and links
 * to nine rule files that do not exist here. Deriving every line from the tree
 * makes that whole class of staleness unrepresentable.
 */

export type IndexFile = { path: string; content: string };

export type LlmsTxtInput = {
	projectName: string;
	summary: string;
	files: IndexFile[];
};

type Section = {
	heading: string;
	/** Prefix a file path must carry to land in this section. */
	prefix: string;
	/** Group entries into `### <subdirectory>` blocks below the section heading. */
	grouped?: boolean;
	/** Fixed entry title, for single-document sections where the heading is the project name. */
	title?: string;
	/**
	 * Where an entry's description comes from when the document has no
	 * frontmatter description. Reference documents are best summarised by their
	 * section headings; prose documents state their purpose in the first line.
	 */
	describeFrom?: "sections" | "lede";
};

/** Section order is the reading order an agent gets: what this is, then how to work in it. */
const SECTIONS: Section[] = [
	{ heading: "Project", prefix: "AGENTS.md", title: "Project overview" },
	{ heading: "Rules", prefix: ".claude/rules/", grouped: true },
	{ heading: "Agents", prefix: ".claude/agents/" },
	{ heading: "Commands", prefix: ".claude/commands/", describeFrom: "lede" },
];

/** Rules sitting directly in the rules root, rather than in a topic subdirectory. */
const UNGROUPED_HEADING = "General";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

function splitFrontmatter(content: string): { fields: Record<string, string>; body: string } {
	const match = content.match(FRONTMATTER);
	if (!match) return { fields: {}, body: content };

	const fields: Record<string, string> = {};
	for (const line of (match[1] as string).split("\n")) {
		const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (field?.[2]) fields[field[1] as string] = field[2];
	}
	return { fields, body: content.slice(match[0].length) };
}

/** First sentence, flattened to one line — descriptions are often several paragraphs long. */
function firstSentence(text: string): string {
	const flat = text.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
	const end = flat.search(/\.(\s|$)/);
	return end === -1 ? flat : flat.slice(0, end + 1);
}

function fileStem(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

function titleOf(file: IndexFile, section: Section): string {
	if (section.title) return section.title;
	const { fields, body } = splitFrontmatter(file.content);
	if (fields.name) return fields.name;
	const heading = body.match(/^#\s+(.+)$/m);
	return heading?.[1]?.trim() ?? fileStem(file.path);
}

function ledeOf(body: string): string {
	const lede = body.split("\n").find((line) => line.trim() !== "" && !line.startsWith("#"));
	return lede ? firstSentence(lede) : "";
}

function descriptionOf(file: IndexFile, section: Section): string {
	const { fields, body } = splitFrontmatter(file.content);
	if (fields.description) return firstSentence(fields.description);
	if (section.describeFrom === "lede") return ledeOf(body);

	const sections = [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => (match[1] as string).trim());
	return sections.length > 0 ? sections.join(", ") : ledeOf(body);
}

function entryLine(file: IndexFile, section: Section): string {
	const description = descriptionOf(file, section);
	const suffix = description ? `: ${description}` : "";
	return `- [${titleOf(file, section)}](${file.path})${suffix}`;
}

/** Subdirectory a rule lives in, or the ungrouped heading for rules at the root. */
function groupOf(path: string, prefix: string): string {
	const rest = path.slice(prefix.length);
	const slash = rest.indexOf("/");
	return slash === -1 ? UNGROUPED_HEADING : rest.slice(0, slash);
}

function renderGrouped(files: IndexFile[], section: Section): string[] {
	const groups = new Map<string, IndexFile[]>();
	for (const file of files) {
		const group = groupOf(file.path, section.prefix);
		groups.set(group, [...(groups.get(group) ?? []), file]);
	}

	// Root-level rules read first; topic subdirectories follow alphabetically.
	const names = [...groups.keys()].sort((a, b) => {
		if (a === UNGROUPED_HEADING) return -1;
		if (b === UNGROUPED_HEADING) return 1;
		return a.localeCompare(b);
	});

	return names.flatMap((name) => [
		`### ${name}`,
		...(groups.get(name) ?? []).map((file) => entryLine(file, section)),
		"",
	]);
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
	const files = [...input.files].sort((a, b) => a.path.localeCompare(b.path));
	const lines: string[] = [`# ${input.projectName}`, "", `> ${input.summary}`, ""];

	for (const section of SECTIONS) {
		const matched = files.filter((file) => file.path.startsWith(section.prefix));
		if (matched.length === 0) continue;

		lines.push(`## ${section.heading}`, "");
		lines.push(
			...(section.grouped
				? renderGrouped(matched, section)
				: [...matched.map((file) => entryLine(file, section)), ""]),
		);
	}

	return `${lines.join("\n").trimEnd()}\n`;
}
