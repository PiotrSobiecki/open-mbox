#!/usr/bin/env tsx
/**
 * Regenerates llms.txt from AGENTS.md and the `.claude/` trees.
 *
 * Run after adding, renaming or deleting a rule, agent or command — the drift
 * test (scripts/llms-txt-drift.test.ts) fails until you do. `public/llms.txt`
 * is a symlink to the file this writes, so the build serves it at /llms.txt
 * without a second copy to maintain.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderLlmsTxt } from "./llms-txt-source";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET = resolve(ROOT, "llms.txt");

writeFileSync(TARGET, renderLlmsTxt(ROOT), "utf8");
console.log("✓ llms.txt regenerated from AGENTS.md and .claude/");
