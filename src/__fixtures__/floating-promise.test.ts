import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execa } from "execa";

describe("biome lint config", () => {
	beforeAll(async () => {
		// Wipe any leftover staging dirs from a previously-crashed run before
		// they poison `pnpm lint` or this test's assertions.
		const srcDir = resolve(import.meta.dirname, "..");
		const entries = await readdir(srcDir, { withFileTypes: true });
		await Promise.all(
			entries
				.filter((e) => e.isDirectory() && e.name.startsWith(".biome-fixture-staging-"))
				.map((e) => rm(join(srcDir, e.name), { recursive: true, force: true })),
		);
	});

	it("flags floating promises in the fixture with noFloatingPromises", async () => {
		const repoRoot = resolve(import.meta.dirname, "../..");
		const fixture = await readFile(
			resolve(import.meta.dirname, "floating-promise.ts"),
			"utf8",
		);

		// Biome refuses to lint paths excluded by `files.includes` even when given
		// explicitly, and `noFloatingPromises` (types domain) needs the file inside
		// the project's TS resolution scope — so stage a copy under src/ in a
		// non-excluded subdirectory.
		const stagingRoot = resolve(repoRoot, "src/.biome-fixture-staging");
		const dir = await mkdtemp(`${stagingRoot}-`);
		const target = join(dir, "floating-promise.ts");
		await writeFile(target, fixture);

		try {
			const result = await execa(
				"./node_modules/.bin/biome",
				["check", target],
				{ cwd: repoRoot, reject: false },
			);

			const combined = `${result.stdout}\n${result.stderr}`;
			expect(result.exitCode, combined).not.toBe(0);
			expect(combined).toContain("noFloatingPromises");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
