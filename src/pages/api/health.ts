/**
 * GET /api/health — the exemplar endpoint (issue #21).
 *
 * Deliberately a shell: it parses request and runtime input, delegates to
 * `@/health`, and constructs a response with an explicit status on both paths.
 * There is no logic here that would need a test of its own — `src/pages/**` is
 * outside test discovery, and the module beneath carries the assertions.
 *
 * Delete this file and `src/health/` to remove the exemplar.
 */

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { checkHealth } from "@/health";

export const GET: APIRoute = ({ url }) => {
	const result = checkHealth({
		environment: env.CLOUDFLARE_ENV,
		verbose: url.searchParams.get("verbose") ?? undefined,
	});

	return result.ok
		? Response.json(result.data, { status: 200 })
		: Response.json({ error: result.error.message }, { status: 400 });
};
