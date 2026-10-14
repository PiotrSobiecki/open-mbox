/**
 * How this site describes itself to crawlers and link unfurlers (issue #26).
 *
 * Three exports, three shells: `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts`
 * and `src/layouts/Layout.astro` each parse, delegate here, and render. Every
 * decision — which routes are listed, what robots advertises, which tags a page
 * emits, and which origin all of them resolve against — is implementation.
 *
 * **Why the sitemap is built here rather than by `@astrojs/sitemap`.** That
 * integration derives its output at build time from routes that were rendered at
 * build time. This template is `output: "server"` and prerenders nothing, so the
 * integration has nothing to enumerate — it would install a dependency and emit an
 * empty document, which is worse than the absence it was added to fix. A route
 * endpoint answers from the same route table the Worker already serves.
 *
 * **Why every function takes both a site and a request URL.** `site` is the
 * configured origin from `astro.config.mjs`, which a clone sets through `SITE_URL`
 * at build time. It is authoritative when present — canonical URLs must not vary by
 * the hostname a request happened to arrive on, or the same page indexes several
 * times over. When it is absent the request's own origin is the only truthful
 * answer available, and it is better than a placeholder baked into a template.
 */

/**
 * One meta tag. Open Graph keys on `property`, Twitter on `name`, and the pair is
 * a union rather than two optional fields so a tag carrying both is unwritable.
 */
type MetaTag =
	| { readonly property: string; readonly content: string }
	| { readonly name: string; readonly content: string };

export interface PageMeta {
	/** The one URL this page should be indexed under. */
	readonly canonical: URL;
	readonly tags: readonly MetaTag[];
}

interface SiteContext {
	/** `Astro.site` — the configured origin, absent only if `site` is unset in config. */
	readonly site: URL | undefined;
	/** `Astro.url` — the URL this request arrived on. */
	readonly url: URL;
}

/** The path `robots.txt` advertises, matching `src/pages/sitemap.xml.ts`. */
const SITEMAP_PATH = "sitemap.xml";

/**
 * Astro skips underscore-prefixed files and cannot enumerate the parameters of a
 * bracketed one, so neither belongs in a sitemap.
 */
const UNROUTED = /(^|\/)_|\[/;

function originOf({ site, url }: SiteContext): URL {
	return site ?? new URL(url.origin);
}

/**
 * `./blog/index.astro` → `/blog`, `./about.md` → `/about`, `./index.astro` → `/`.
 *
 * Takes the keys `import.meta.glob` produces for the pages directory: paths
 * relative to it, extension included.
 */
function routeOf(pageFile: string): string | undefined {
	if (UNROUTED.test(pageFile)) return undefined;

	const route = pageFile
		.replace(/^\.\//, "")
		.replace(/\.(astro|md|mdx)$/, "")
		.replace(/(^|\/)index$/, "");

	return `/${route}`;
}

/** The five characters that would otherwise close a tag or open an entity. */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * The sitemap document for this site's static routes.
 *
 * Routes are sorted so the output is stable: a document that reorders itself on
 * every request is a document whose diffs say nothing.
 */
export function renderSitemap(context: SiteContext & { pageFiles: readonly string[] }): string {
	const origin = originOf(context);
	const routes = [
		...new Set(context.pageFiles.map(routeOf).filter((route) => route !== undefined)),
	];

	const entries = routes
		.sort()
		.map((route) => `\t<url>\n\t\t<loc>${escapeXml(new URL(route, origin).href)}</loc>\n\t</url>`)
		.join("\n");

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		entries,
		"</urlset>",
		"",
	]
		.filter((line) => line !== "")
		.join("\n");
}

/**
 * The robots document.
 *
 * Permissive by design: a template that shipped `Disallow: /` would silently
 * deindex the first clone that forgot to look. Tightening it is one edit; noticing
 * that nothing was ever indexed takes months.
 */
export function renderRobots(context: SiteContext): string {
	const sitemap = new URL(SITEMAP_PATH, originOf(context)).href;

	return `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`;
}

/**
 * The canonical URL and link-preview tags for one page.
 *
 * Query strings are dropped from the canonical URL: `?utm_source=…` names the same
 * page, and indexing it separately is how one article becomes six results.
 *
 * `twitter:card` is `summary` rather than `summary_large_image` because this
 * template ships no preview image, and the large card degrades to a blank panel
 * without one. A clone that adds an image should switch the card here and add an
 * `og:image` tag — both belong in this list, not in the layout.
 */
export function buildPageMeta(
	context: SiteContext & { title: string; description: string },
): PageMeta {
	const canonical = new URL(context.url.pathname, originOf(context));

	return {
		canonical,
		tags: [
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: context.title },
			{ property: "og:description", content: context.description },
			{ property: "og:url", content: canonical.href },
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: context.title },
			{ name: "twitter:description", content: context.description },
		],
	};
}
