/**
 * Boundary test for the SEO module (issue #26).
 *
 * The module owns everything a crawler or a link unfurler sees: which routes are
 * listed, what robots points at, and the tags a shared page emits. All three are
 * pure functions over a site URL and a request URL, so they are exercised here
 * without a request pipeline or a build.
 *
 * The three shells that call them — two endpoints and the layout — are outside
 * test discovery, so they are read as text instead. The layout must name no tag
 * of its own: if `og:title` appears there, the module is no longer the single
 * place the page's identity is decided.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPageMeta, renderRobots, renderSitemap } from "./index";

const ROOT = resolve(import.meta.dirname, "..", "..");
const LAYOUT = readFileSync(resolve(ROOT, "src", "layouts", "Layout.astro"), "utf8");
const ASTRO_CONFIG = readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8");

const SITE = new URL("https://example.com");
const REQUEST = new URL("https://worker.example.workers.dev/about");

/** What `import.meta.glob("./**\/*.{astro,md,mdx}")` hands the sitemap endpoint. */
const PAGE_FILES = [
	"./index.astro",
	"./about.astro",
	"./blog/index.astro",
	"./blog/[slug].astro",
	"./blog/[...path].astro",
	"./_draft.astro",
	"./guides/getting-started.md",
];

function locsIn(sitemap: string): string[] {
	return [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1] as string);
}

function contentOf(tags: readonly { content: string }[], key: string): string | undefined {
	return tags.find((tag) => Object.values(tag).includes(key))?.content;
}

describe("renderSitemap", () => {
	const sitemap = renderSitemap({ site: SITE, url: REQUEST, pageFiles: PAGE_FILES });

	it("declares itself as a sitemap XML document", () => {
		expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
		expect(sitemap.trimEnd().endsWith("</urlset>")).toBe(true);
	});

	it("lists every static route as an absolute URL on the configured site", () => {
		expect(locsIn(sitemap)).toEqual([
			"https://example.com/",
			"https://example.com/about",
			"https://example.com/blog",
			"https://example.com/guides/getting-started",
		]);
	});

	it("lists no dynamic route, since nothing here can enumerate its parameters", () => {
		expect(sitemap).not.toContain("[");
	});

	it("lists no underscore-prefixed file — Astro does not route those", () => {
		expect(sitemap).not.toContain("_draft");
	});

	it("falls back to the requested origin when no site is configured", () => {
		const fallback = renderSitemap({ site: undefined, url: REQUEST, pageFiles: ["./index.astro"] });

		expect(locsIn(fallback)).toEqual(["https://worker.example.workers.dev/"]);
	});

	it("escapes XML-significant characters, so one odd route cannot break the document", () => {
		const odd = renderSitemap({ site: SITE, url: REQUEST, pageFiles: ["./a&b.astro"] });

		expect(odd).toContain("&amp;");
		expect(locsIn(odd)).toEqual(["https://example.com/a&amp;b"]);
	});

	it("emits nothing but the envelope when there are no static routes", () => {
		const empty = renderSitemap({ site: SITE, url: REQUEST, pageFiles: [] });

		expect(locsIn(empty)).toEqual([]);
		expect(empty).toContain("</urlset>");
	});

	it("is pure — the same input yields the same document", () => {
		expect(renderSitemap({ site: SITE, url: REQUEST, pageFiles: PAGE_FILES })).toBe(sitemap);
	});
});

describe("renderRobots", () => {
	const robots = renderRobots({ site: SITE, url: REQUEST });

	it("addresses every crawler", () => {
		expect(robots).toMatch(/^User-agent: \*$/m);
	});

	it("allows the site to be indexed", () => {
		expect(robots).toMatch(/^Allow: \/$/m);
	});

	it("points at the sitemap by absolute URL", () => {
		expect(robots).toMatch(/^Sitemap: https:\/\/example\.com\/sitemap\.xml$/m);
	});

	it("points at a sitemap this repository actually serves", () => {
		const advertised = robots.match(/^Sitemap: (\S+)$/m)?.[1];

		expect(advertised).toBeDefined();
		const route = new URL(advertised as string).pathname.replace(/^\//, "");
		expect(existsSync(resolve(ROOT, "src", "pages", `${route}.ts`))).toBe(true);
	});

	it("falls back to the requested origin when no site is configured", () => {
		expect(renderRobots({ site: undefined, url: REQUEST })).toContain(
			"Sitemap: https://worker.example.workers.dev/sitemap.xml",
		);
	});
});

describe("buildPageMeta", () => {
	const meta = buildPageMeta({
		title: "A page",
		description: "What the page is",
		site: SITE,
		url: REQUEST,
	});

	it("canonicalises the requested path onto the configured site", () => {
		expect(meta.canonical.href).toBe("https://example.com/about");
	});

	it("canonicalises onto the requested origin when no site is configured", () => {
		const fallback = buildPageMeta({
			title: "A page",
			description: "What the page is",
			site: undefined,
			url: REQUEST,
		});

		expect(fallback.canonical.href).toBe("https://worker.example.workers.dev/about");
	});

	it("drops the query string, so one page is not indexed under many URLs", () => {
		const withQuery = buildPageMeta({
			title: "A page",
			description: "What the page is",
			site: SITE,
			url: new URL("https://worker.example.workers.dev/about?utm_source=newsletter"),
		});

		expect(withQuery.canonical.href).toBe("https://example.com/about");
	});

	it.each([
		["og:type", "website"],
		["og:title", "A page"],
		["og:description", "What the page is"],
		["og:url", "https://example.com/about"],
	])("emits %s for Open Graph consumers", (property, content) => {
		expect(meta.tags).toContainEqual({ property, content });
	});

	it.each([
		["twitter:card", "summary"],
		["twitter:title", "A page"],
		["twitter:description", "What the page is"],
	])("emits %s for Twitter consumers", (name, content) => {
		expect(meta.tags).toContainEqual({ name, content });
	});

	it("carries the page's own title and description into every tag that names one", () => {
		expect(contentOf(meta.tags, "og:title")).toBe(contentOf(meta.tags, "twitter:title"));
		expect(contentOf(meta.tags, "og:description")).toBe(
			contentOf(meta.tags, "twitter:description"),
		);
	});

	it("is pure — the same input yields the same tags", () => {
		expect(
			buildPageMeta({
				title: "A page",
				description: "What the page is",
				site: SITE,
				url: REQUEST,
			}).tags,
		).toStrictEqual(meta.tags);
	});
});

describe("the shared layout", () => {
	it("takes its tags from the module rather than writing them out", () => {
		expect(LAYOUT).toMatch(/from "@\/seo"/);
		expect(LAYOUT).toMatch(/buildPageMeta\(/);
	});

	it("names no tag of its own, so the module stays the only place they are decided", () => {
		expect(LAYOUT).not.toMatch(/og:|twitter:/);
	});

	it("emits a canonical link", () => {
		expect(LAYOUT).toMatch(/rel="canonical"/);
	});

	it("drives the tags from the props it already had, with defaults for both", () => {
		expect(LAYOUT).toMatch(/title = "[^"]+"/);
		expect(LAYOUT).toMatch(/description = "[^"]+"/);
		expect(LAYOUT).toMatch(/buildPageMeta\(\{[\s\S]{0,120}?title[\s\S]{0,120}?description/);
	});
});

describe("the configured site URL", () => {
	it("is set, so canonical URLs and the sitemap have an origin to resolve against", () => {
		expect(ASTRO_CONFIG).toMatch(/\bsite:\s*\S/);
	});

	it("comes from the environment, so a clone configures it without editing config", () => {
		expect(ASTRO_CONFIG).toMatch(/process\.env\.SITE_URL/);
	});

	it("names the environment variable where a reader will look for it", () => {
		expect(readFileSync(resolve(ROOT, "README.md"), "utf8")).toContain("SITE_URL");
	});
});
