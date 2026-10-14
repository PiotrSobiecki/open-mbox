/**
 * Reads the documents the agent index is built from and renders it.
 *
 * Read-only by design: the drift test imports `renderLlmsTxt` to compare
 * against the committed file, so nothing here may write. The write lives in
 * `generate-llms-txt.ts` alone — a drift test that could rewrite its own
 * expectation would pass forever. See issue #20.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildLlmsTxt, type IndexFile, type LlmsTxtInput } from "./llms-txt-lib";

/** The agent-facing project doc, and the trees whose contents the index links. */
const PROJECT_DOC = "AGENTS.md";
const TREES = [".claude/rules", ".claude/agents", ".claude/commands"];

function markdownFiles(dir: string, prefix: string): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const path = `${prefix}/${entry.name}`;
			if (entry.isDirectory()) return markdownFiles(join(dir, entry.name), path);
			return entry.name.endsWith(".md") ? [path] : [];
		})
		.sort();
}

/** The lede of AGENTS.md — the one-line summary of what this project is. */
function summaryOf(projectDoc: string): string {
	const lede = projectDoc.split("\n").find((line) => line.trim() !== "" && !line.startsWith("#"));
	return lede?.trim() ?? "";
}

function collectLlmsTxtInput(root: string): LlmsTxtInput {
	const paths = [PROJECT_DOC, ...TREES.flatMap((tree) => markdownFiles(resolve(root, tree), tree))];
	const files: IndexFile[] = paths.map((path) => ({
		path,
		content: readFileSync(resolve(root, path), "utf8"),
	}));

	const { name } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
		name: string;
	};
	const projectDoc = files.find((file) => file.path === PROJECT_DOC);

	return { projectName: name, summary: summaryOf(projectDoc?.content ?? ""), files };
}

export function renderLlmsTxt(root: string): string {
	return buildLlmsTxt(collectLlmsTxtInput(root));
}
