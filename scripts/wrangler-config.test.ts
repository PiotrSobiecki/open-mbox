/**
 * Contract test for the Worker runtime configuration.
 *
 * Observability (issue #4): Cloudflare's Workers best-practices doc calls out
 * sampling rate as a deliberate production knob. Defaulting works, but for a
 * template repo that may be deployed at meaningful traffic we surface the value
 * explicitly so future tuning is a one-character edit instead of a research task.
 *
 * Source maps (issue #19): observability being on while source map upload is off
 * is a half-configured state — traces arrive, but point at minified output. Both
 * halves are asserted here because uploading maps the build never emits is the
 * same defect wearing the opposite mask.
 *
 * Adapter decisions (issue #24): configured with no options, the adapter chose for
 * us and wrote the results into its generated config — an `images: { binding:
 * "IMAGES" }` nobody asked for, and `kv_namespaces: [{ binding: "SESSION" }]` with
 * no id, which fails at deploy the first time a clone touches sessions. Each of
 * those is now a stated choice, and each is asserted here so removing one turns
 * the suite red rather than quietly restoring the default.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripJsonc } from "./init-project-lib";

const ROOT = resolve(import.meta.dirname, "..");

const wranglerSource = readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8");
const astroConfigSource = readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8");

const wranglerConfig = JSON.parse(stripJsonc(wranglerSource)) as {
	observability?: { enabled?: boolean; head_sampling_rate?: unknown };
	upload_source_maps?: boolean;
	assets?: Record<string, unknown>;
	kv_namespaces?: unknown;
	images?: unknown;
};

describe("wrangler.jsonc observability", () => {
	const observability = wranglerConfig.observability;

	it("is enabled", () => {
		expect(observability?.enabled).toBe(true);
	});

	it("declares head_sampling_rate explicitly", () => {
		expect(observability?.head_sampling_rate).toBeDefined();
	});

	it("sets head_sampling_rate to a number in (0, 1]", () => {
		const rate = observability?.head_sampling_rate;
		expect(typeof rate).toBe("number");
		expect(rate).toBeGreaterThan(0);
		expect(rate).toBeLessThanOrEqual(1);
	});
});

describe("source maps", () => {
	it("uploads source maps with the Worker", () => {
		expect(wranglerConfig.upload_source_maps).toBe(true);
	});

	it("emits source maps from the build, so the upload has something to carry", () => {
		expect(astroConfigSource).toMatch(/sourcemap:\s*true/);
	});
});

describe("image service", () => {
	it("is pinned to build-time compilation rather than left to the adapter", () => {
		expect(astroConfigSource).toMatch(/imageService:\s*\{[^}]*build:\s*"compile"/);
	});

	it("keeps the runtime off the Images binding, so no clone inherits a paid product", () => {
		expect(astroConfigSource).toMatch(/imageService:\s*\{[^}]*runtime:\s*"passthrough"/);
	});

	it("records the runtime alternative for consumers who need on-demand transforms", () => {
		expect(astroConfigSource).toMatch(/cloudflare-binding/);
	});

	it("declares no images binding of its own, since nothing needs one at runtime", () => {
		expect(wranglerConfig.images).toBeUndefined();
	});
});

/**
 * What wrangler.jsonc becomes once a consumer uncomments the optional bindings.
 *
 * Only lines whose comment body opens with JSON punctuation are revealed, so the
 * surrounding prose stays commented. The first attempt at this block put the
 * bindings after `env`, where uncommenting produced `CommaExpected` and a failed
 * build — a documented instruction that breaks the file is worse than no example,
 * so the parse below is asserted rather than assumed.
 */
function withOptionalBindingsEnabled(source: string): string {
	return source
		.split("\n")
		.map((line) => {
			const match = line.match(/^(\s*)\/\/\s*([[{"\]}].*)$/);
			return match ? `${match[1]}${match[2]}` : line;
		})
		.join("\n");
}

describe("session binding", () => {
	it("is pre-wired, so the first clone to use sessions has an id to fill in", () => {
		expect(wranglerSource).toMatch(/"binding":\s*"SESSION"/);
	});

	it("names the command that produces a real namespace id", () => {
		expect(wranglerSource).toMatch(/wrangler kv namespace create/);
	});

	it("ships commented, so no half-configured binding reaches a deploy", () => {
		expect(wranglerConfig.kv_namespaces).toBeUndefined();
	});

	it("becomes a real binding when uncommented, leaving the file valid JSONC", () => {
		const enabled = JSON.parse(stripJsonc(withOptionalBindingsEnabled(wranglerSource))) as {
			kv_namespaces?: { binding: string; id: string }[];
		};
		expect(enabled.kv_namespaces).toContainEqual({
			binding: "SESSION",
			id: "<kv-namespace-id>",
		});
	});
});

describe("assets routing", () => {
	it.each([
		"html_handling",
		"not_found_handling",
		"run_worker_first",
	])("documents %s, so the current behaviour reads as chosen rather than defaulted", (option) => {
		expect(wranglerSource).toContain(option);
	});

	it("leaves them commented — the defaults are the choice, not an oversight", () => {
		expect(wranglerConfig.assets).toEqual({ directory: "./dist", binding: "ASSETS" });
	});
});
