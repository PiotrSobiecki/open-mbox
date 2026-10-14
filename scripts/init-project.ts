#!/usr/bin/env tsx
/**
 * One-shot project bootstrap. Idempotent — safe to re-run.
 *
 * 1. Prompt once for kebab-case project name.
 * 2. Rename root package.json + wrangler.jsonc (skip if already renamed).
 * 3. Warn if wrangler.jsonc lacks env.staging / env.production blocks.
 * 4. Fan out *.example templates into per-environment files (skip if exists).
 * 5. With --with-db: scaffold Drizzle/Neon data layer (configs, src/db/, db:* scripts).
 * 6. Print a next-steps checklist.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
	isValidProjectName,
	missingWranglerEnvs,
	RENAME_TARGETS,
	stripJsonc,
	symbolFor,
} from "./init-project-lib";
import type { FanoutResult, RenameResult, RenameTarget } from "./init-project-types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WITH_DB_FLAG = "--with-db";

type EnvTemplate = { template: string; target: string };

const ENV_TEMPLATES: EnvTemplate[] = [
	{ template: ".env.example", target: ".env" },
	{ template: ".dev.vars.example", target: ".dev.vars" },
	{ template: ".dev.vars.staging.example", target: ".dev.vars.staging" },
	{ template: ".dev.vars.production.example", target: ".dev.vars.production" },
];

const WRANGLER_FILES = ["wrangler.jsonc"];
const REQUIRED_WRANGLER_ENVS = ["dev", "staging", "production"];

const DB_SCRIPTS = {
	"db:generate:dev":
		"dotenvx run -f .dev.vars -- drizzle-kit generate --config drizzle-dev.config.ts",
	"db:generate:staging":
		"dotenvx run -f .dev.vars.staging -- drizzle-kit generate --config drizzle-staging.config.ts",
	"db:generate:production":
		"dotenvx run -f .dev.vars.production -- drizzle-kit generate --config drizzle-production.config.ts",
	"db:migrate:dev":
		"dotenvx run -f .dev.vars -- drizzle-kit migrate --config drizzle-dev.config.ts",
	"db:migrate:staging":
		"dotenvx run -f .dev.vars.staging -- drizzle-kit migrate --config drizzle-staging.config.ts",
	"db:migrate:production":
		"dotenvx run -f .dev.vars.production -- drizzle-kit migrate --config drizzle-production.config.ts",
	"db:pull:dev": "dotenvx run -f .dev.vars -- drizzle-kit pull --config drizzle-dev.config.ts",
	"db:pull:staging":
		"dotenvx run -f .dev.vars.staging -- drizzle-kit pull --config drizzle-staging.config.ts",
	"db:pull:production":
		"dotenvx run -f .dev.vars.production -- drizzle-kit pull --config drizzle-production.config.ts",
	"db:studio": "dotenvx run -f .dev.vars -- drizzle-kit studio --config drizzle-dev.config.ts",
	"db:seed:dev": "dotenvx run -f .dev.vars -- tsx scripts/seed.ts",
	"db:seed:staging": "dotenvx run -f .dev.vars.staging -- tsx scripts/seed.ts",
	"db:seed:production": "dotenvx run -f .dev.vars.production -- tsx scripts/seed.ts",
} as const;

const DB_DEPENDENCIES = {
	"@neondatabase/serverless": "^1.1.0",
	"drizzle-orm": "^0.45.2",
} as const;

const DB_DEV_DEPENDENCIES = {
	"@dotenvx/dotenvx": "^1.66.0",
	"drizzle-kit": "^0.31.10",
} as const;

const DB_VARS_BODY = `DATABASE_HOST=""
DATABASE_USERNAME=""
DATABASE_PASSWORD=""
`;

const DRIZZLE_CONFIG = (envName: string) => `import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: \`./src/db/migrations/${envName}\`,
	dialect: "postgresql",
	dbCredentials: {
		host: process.env.DATABASE_HOST ?? "",
		user: process.env.DATABASE_USERNAME ?? "",
		password: process.env.DATABASE_PASSWORD ?? "",
		database: "neondb",
		ssl: "require",
	},
});
`;

const DB_SETUP_TS = `import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema> | undefined;

export type DbConfig = {
	host: string;
	username: string;
	password: string;
};

export function initDatabase(config: DbConfig): void {
	if (db) return;
	const url = \`postgresql://\${config.username}:\${config.password}@\${config.host}\`;
	db = drizzle(neon(url), { schema });
}

export function getDb(): NeonHttpDatabase<typeof schema> {
	if (!db) throw new Error("Database not initialized — call initDatabase() first.");
	return db;
}
`;

const DB_SCHEMA_TS = `// Re-export all per-domain tables.
// Example: export * from "./client/table";
export {};
`;

const DB_INDEX_TS = `export { initDatabase, getDb, type DbConfig } from "./setup";
`;

const NEXT_STEPS_BASE = [
	"(optional) Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in .env",
	"  or run `wrangler login` instead.",
	"Run `pnpm cf-typegen` to refresh worker-configuration.d.ts.",
	"Start dev: pnpm run dev",
];

const NEXT_STEPS_WITH_DB = [
	"Fill DB credentials in .dev.vars / .dev.vars.staging / .dev.vars.production",
	"  Get from https://console.neon.tech (DATABASE_HOST/USERNAME/PASSWORD).",
	"Generate + apply initial migration: pnpm run db:generate:dev && pnpm run db:migrate:dev",
	...NEXT_STEPS_BASE,
];

// ── helpers ──────────────────────────────────────────────────────────

function abs(...segments: string[]): string {
	return path.join(ROOT, ...segments);
}

async function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

function readJson<T = unknown>(file: string): T {
	return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function writeJson(file: string, value: unknown): void {
	fs.writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`, "utf-8");
}

function renamePackageJson(file: string, name: string): "renamed" | "skipped" {
	const pkg = readJson<{ name?: string }>(file);
	if (pkg.name === name) return "skipped";
	pkg.name = name;
	writeJson(file, pkg);
	return "renamed";
}

function renameAllOccurrences(file: string, name: string, needle: string): "renamed" | "skipped" {
	const content = fs.readFileSync(file, "utf-8");
	const replaced = content.replaceAll(needle, name);
	if (replaced === content) return "skipped";
	fs.writeFileSync(file, replaced, "utf-8");
	return "renamed";
}

function applyRename(target: RenameTarget, name: string): RenameResult {
	const file = abs(target.file);
	if (!fs.existsSync(file)) return "missing";
	if (target.mode === "package-name") return renamePackageJson(file, name);
	return renameAllOccurrences(file, name, target.needle);
}

function checkWranglerEnvs(file: string, required: string[]): string[] {
	if (!fs.existsSync(file)) return [`${file}: file not found`];
	let parsed: { env?: Record<string, unknown> };
	try {
		parsed = JSON.parse(stripJsonc(fs.readFileSync(file, "utf-8"))) as {
			env?: Record<string, unknown>;
		};
	} catch (e) {
		return [`${file}: parse failed (${(e as Error).message.split("\n")[0]})`];
	}
	return missingWranglerEnvs(parsed, required).map((e) => `${file}: missing env.${e}`);
}

function fanoutEnv(template: string, target: string): FanoutResult {
	const templatePath = abs(template);
	const targetPath = abs(target);
	if (!fs.existsSync(templatePath)) return "no-template";
	if (fs.existsSync(targetPath)) return "skipped";
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.copyFileSync(templatePath, targetPath);
	return "copied";
}

function ensureFile(relPath: string, contents: string): "created" | "skipped" {
	const file = abs(relPath);
	if (fs.existsSync(file)) return "skipped";
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents, "utf-8");
	return "created";
}

function appendVarsBody(file: string, body: string): "appended" | "skipped" | "no-target" {
	const target = abs(file);
	if (!fs.existsSync(target)) return "no-target";
	const current = fs.readFileSync(target, "utf-8");
	if (current.includes("DATABASE_HOST")) return "skipped";
	const sep = current.endsWith("\n") ? "" : "\n";
	fs.writeFileSync(target, `${current}${sep}${body}`, "utf-8");
	return "appended";
}

function mergePackageScripts(scripts: Record<string, string>): "merged" | "skipped" {
	const pkgPath = abs("package.json");
	const pkg = readJson<{ scripts?: Record<string, string> }>(pkgPath);
	const before = JSON.stringify(pkg.scripts ?? {});
	pkg.scripts = { ...(pkg.scripts ?? {}), ...scripts };
	const after = JSON.stringify(pkg.scripts);
	if (before === after) return "skipped";
	writeJson(pkgPath, pkg);
	return "merged";
}

function mergePackageDeps(
	section: "dependencies" | "devDependencies",
	deps: Record<string, string>,
): "merged" | "skipped" {
	const pkgPath = abs("package.json");
	const pkg = readJson<{
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	}>(pkgPath);
	const current = pkg[section] ?? {};
	const before = JSON.stringify(current);
	pkg[section] = { ...current, ...deps };
	const after = JSON.stringify(pkg[section]);
	if (before === after) return "skipped";
	writeJson(pkgPath, pkg);
	return "merged";
}

// ── steps ────────────────────────────────────────────────────────────

function stepRename(name: string): void {
	console.log("[1/5] Rename project references");
	for (const target of RENAME_TARGETS) {
		const result = applyRename(target, name);
		console.log(`      ${symbolFor(result)} ${target.file} (${result})`);
	}
}

function stepVerifyWrangler(): void {
	console.log("\n[2/5] Verify wrangler env blocks");
	const warnings = WRANGLER_FILES.flatMap((w) => checkWranglerEnvs(abs(w), REQUIRED_WRANGLER_ENVS));
	if (warnings.length === 0) {
		console.log(`      ✓ all wrangler.jsonc declare ${REQUIRED_WRANGLER_ENVS.join(", ")}`);
		return;
	}
	for (const w of warnings) console.log(`      ⚠ ${w}`);
	console.log("      (warn-only — script does not modify wrangler structure)");
}

function stepFanoutEnv(): void {
	console.log("\n[3/5] Create per-environment env files");
	for (const { template, target } of ENV_TEMPLATES) {
		const result = fanoutEnv(template, target);
		const detail = result === "copied" ? `from ${template}` : result;
		console.log(`      ${symbolFor(result)} ${target} (${detail})`);
	}
}

function stepScaffoldDb(): void {
	console.log("\n[4/5] Scaffold Drizzle + Neon data layer");

	const files: Array<[string, string]> = [
		["drizzle-dev.config.ts", DRIZZLE_CONFIG("dev")],
		["drizzle-staging.config.ts", DRIZZLE_CONFIG("staging")],
		["drizzle-production.config.ts", DRIZZLE_CONFIG("production")],
		["src/db/setup.ts", DB_SETUP_TS],
		["src/db/schema.ts", DB_SCHEMA_TS],
		["src/db/index.ts", DB_INDEX_TS],
		["src/db/migrations/dev/.gitkeep", ""],
		["src/db/migrations/staging/.gitkeep", ""],
		["src/db/migrations/production/.gitkeep", ""],
	];
	for (const [rel, body] of files) {
		const result = ensureFile(rel, body);
		console.log(`      ${result === "created" ? "✓" : "·"} ${rel} (${result})`);
	}

	for (const target of [
		".dev.vars.example",
		".dev.vars.staging.example",
		".dev.vars.production.example",
	]) {
		const result = appendVarsBody(target, DB_VARS_BODY);
		console.log(`      ${result === "appended" ? "✓" : "·"} ${target} (${result})`);
	}
	for (const target of [".dev.vars", ".dev.vars.staging", ".dev.vars.production"]) {
		const result = appendVarsBody(target, DB_VARS_BODY);
		console.log(`      ${result === "appended" ? "✓" : "·"} ${target} (${result})`);
	}

	const scripts = mergePackageScripts(DB_SCRIPTS);
	console.log(`      ${scripts === "merged" ? "✓" : "·"} package.json scripts (${scripts})`);
	const deps = mergePackageDeps("dependencies", DB_DEPENDENCIES);
	console.log(`      ${deps === "merged" ? "✓" : "·"} package.json dependencies (${deps})`);
	const devDeps = mergePackageDeps("devDependencies", DB_DEV_DEPENDENCIES);
	console.log(
		`      ${devDeps === "merged" ? "✓" : "·"} package.json devDependencies (${devDeps})`,
	);
}

function stepNextSteps(name: string, withDb: boolean): void {
	console.log("\n[5/5] Next steps:\n");
	const steps = withDb ? NEXT_STEPS_WITH_DB : NEXT_STEPS_BASE;
	for (const step of steps) console.log(`  ${step}`);
	console.log(
		`\n✓ Project "${name}" initialized${withDb ? " with Drizzle/Neon data layer" : ""}. Re-run anytime — already-applied steps are skipped.`,
	);
}

// ── main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	let withDb = argv.includes(WITH_DB_FLAG);

	const name = await prompt("Project name (kebab-case): ");
	if (!isValidProjectName(name)) {
		console.error("✗ Invalid name. Must be kebab-case (e.g. my-app).");
		process.exit(1);
	}

	if (!withDb) {
		const answer = await prompt("Include Drizzle + Neon data layer? [y/N]: ");
		withDb = /^y(es)?$/i.test(answer);
	}

	console.log(`\n→ Initializing project: ${name}${withDb ? " (with DB)" : ""}\n`);
	stepRename(name);
	stepVerifyWrangler();
	stepFanoutEnv();
	if (withDb) stepScaffoldDb();
	stepNextSteps(name, withDb);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
