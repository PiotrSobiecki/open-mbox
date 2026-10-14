import type { APIRoute } from "astro";
import { renderSitemap } from "@/seo";

/**
 * The pages directory, resolved by Vite at build time — the running Worker reads
 * no filesystem and the list cannot drift from the routes that were shipped. The
 * modules themselves are never imported; only their paths are used.
 */
const PAGE_FILES = Object.keys(import.meta.glob("./**/*.{astro,md,mdx}"));

export const GET: APIRoute = ({ site, url }) =>
	new Response(renderSitemap({ site, url, pageFiles: PAGE_FILES }), {
		status: 200,
		headers: { "content-type": "application/xml; charset=utf-8" },
	});
