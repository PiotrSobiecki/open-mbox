import type { APIRoute } from "astro";
import { renderRobots } from "@/seo";

export const GET: APIRoute = ({ site, url }) =>
	new Response(renderRobots({ site, url }), {
		status: 200,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
