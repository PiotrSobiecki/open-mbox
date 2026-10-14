/**
 * Example test suite — pattern reference for this template.
 *
 * Convention:
 *   - Live next to the source they cover (`init-project-lib.ts` ↔
 *     `init-project-lib.test.ts`). Same directory, mirrored name.
 *   - Test only the module's public boundary (exported functions),
 *     not internals — see `.claude/rules/deep-modules.md`.
 *   - One `describe()` per exported function, one `it()` per behavior.
 *   - Vitest globals are enabled in vitest.config.ts, so no imports
 *     for `describe` / `it` / `expect`.
 *   - Pure functions only. Side-effect orchestration is tested via
 *     integration tests (none yet) — never by reaching into a script's
 *     `main()` and mocking fs.
 */

import {
	isValidProjectName,
	missingWranglerEnvs,
	RENAME_TARGETS,
	stripJsonc,
	symbolFor,
} from "./init-project-lib";

describe("RENAME_TARGETS", () => {
	const files = RENAME_TARGETS.map((target) => target.file);

	it.each([
		"package.json",
		"wrangler.jsonc",
		"llms.txt",
	])("rewrites the project name in %s during scaffolding", (file) => {
		expect(files).toContain(file);
	});
});

describe("stripJsonc", () => {
	it("removes line comments", () => {
		expect(stripJsonc(`{ "a": 1 } // trailing`)).toBe(`{ "a": 1 } `);
	});

	it("removes block comments including multi-line", () => {
		const input = `{\n  /* a\n  multi-line note */\n  "a": 1\n}`;
		expect(JSON.parse(stripJsonc(input))).toEqual({ a: 1 });
	});

	it("leaves comment-free JSON untouched", () => {
		const input = `{"a":1,"b":[true,null]}`;
		expect(stripJsonc(input)).toBe(input);
	});

	// A `//` inside a string is not a comment. knip.jsonc declares an https
	// `$schema`, and a naive stripper truncated it to `"https:` and produced
	// unparseable JSON — silently, at the first config that used a URL.
	it("keeps a // that lives inside a string", () => {
		const input = `{"$schema":"https://unpkg.com/knip@6/schema.json"} // note`;
		expect(JSON.parse(stripJsonc(input))).toEqual({
			$schema: "https://unpkg.com/knip@6/schema.json",
		});
	});

	it("keeps a /* that lives inside a string", () => {
		const input = `{"glob":"src/**/*.ts"}`;
		expect(JSON.parse(stripJsonc(input))).toEqual({ glob: "src/**/*.ts" });
	});

	it("is not fooled by an escaped quote before a //", () => {
		const input = String.raw`{"a":"say \"hi\" // not a comment"}`;
		expect(JSON.parse(stripJsonc(input))).toEqual({ a: `say "hi" // not a comment` });
	});
});

describe("isValidProjectName", () => {
	it.each([
		["my-app", true],
		["app", true],
		["a1-b2-c3", true],
		["MyApp", false], // uppercase not allowed
		["-leading", false],
		["trailing-", false],
		["double--dash", false],
		["1starts-with-digit", false],
		["", false],
	])("returns %s for %s", (input, expected) => {
		expect(isValidProjectName(input)).toBe(expected);
	});
});

describe("missingWranglerEnvs", () => {
	const required = ["dev", "staging", "production"] as const;

	it("returns empty when all required blocks exist", () => {
		const parsed = { env: { dev: {}, staging: {}, production: {} } };
		expect(missingWranglerEnvs(parsed, required)).toEqual([]);
	});

	it("flags every missing block", () => {
		expect(missingWranglerEnvs({ env: { dev: {} } }, required)).toEqual(["staging", "production"]);
	});

	it("flags every block when env is absent", () => {
		expect(missingWranglerEnvs({}, required)).toEqual(["dev", "staging", "production"]);
		expect(missingWranglerEnvs(null, required)).toEqual(["dev", "staging", "production"]);
	});
});

describe("symbolFor", () => {
	it("maps success states to a checkmark", () => {
		expect(symbolFor("renamed")).toBe("✓");
		expect(symbolFor("copied")).toBe("✓");
	});

	it("maps skipped to a neutral dot", () => {
		expect(symbolFor("skipped")).toBe("·");
	});

	it("maps everything else to a failure mark", () => {
		expect(symbolFor("missing")).toBe("✗");
		expect(symbolFor("no-template")).toBe("✗");
	});
});
