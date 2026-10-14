/**
 * Health module — the template's exemplar of the split the rules prescribe
 * (issue #21).
 *
 * The interface is three exports; everything else — the schema, the coercion,
 * the checks, the failure wording — is implementation. `src/pages/api/health.ts`
 * is a shell that parses, delegates here, and constructs a response. This module
 * owns what "healthy" means and what gets reported, which is why it is the thing
 * with a test.
 *
 * `checkHealth` is pure and total: it never throws, never reads `env`, never
 * touches the clock. That is what lets the boundary test assert both the success
 * shape and the validation-failure shape without a request pipeline.
 *
 * To remove the exemplar: delete `src/health/` and `src/pages/api/health.ts`.
 * Nothing else references either, and `zod` is the only dependency they add.
 */

import { z } from "zod";

/** The environments `wrangler.jsonc` declares an `env` block for. */
export const DECLARED_ENVIRONMENTS = ["dev", "staging", "production"] as const;

type DeclaredEnvironment = (typeof DECLARED_ENVIRONMENTS)[number];

/**
 * Validation at the boundary, per `.claude/rules/api/astro-endpoints.md`.
 *
 * `environment` is deliberately an enum rather than a string: a Worker running
 * outside a declared `env` block has no `CLOUDFLARE_ENV`, and this endpoint
 * should say so loudly instead of reporting a cheerful `200`.
 */
const HealthRequest = z.object({
	environment: z.enum(DECLARED_ENVIRONMENTS),
	// Query strings carry text, so the flag is parsed from its literals rather
	// than coerced — `Boolean("false")` is `true`, which is not what a caller means.
	verbose: z
		.enum(["true", "false"])
		.default("false")
		.transform((value) => value === "true"),
});

/** One named check and its outcome. Reported only when the caller asks for detail. */
interface HealthCheck {
	readonly name: string;
	readonly status: "ok";
}

/**
 * Not exported: callers reach it structurally through `HealthResult`, and the
 * interface stays three names wide.
 */
interface HealthReport {
	readonly status: "ok";
	readonly environment: DeclaredEnvironment;
	/** Present only when the caller asked for detail. */
	readonly checks?: readonly HealthCheck[];
}

/** A rejected health request. Recoverable, so it is returned rather than thrown. */
export class HealthInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HealthInputError";
	}
}

export type HealthResult =
	| { readonly ok: true; readonly data: HealthReport }
	| { readonly ok: false; readonly error: HealthInputError };

/**
 * Validate a health request and report on it.
 *
 * Add real checks — database reachability, a downstream ping — to `checks`
 * below as the project grows. The template has nothing to check yet, so the
 * only check is the one the schema already performed.
 */
export function checkHealth(input: unknown): HealthResult {
	const parsed = HealthRequest.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: new HealthInputError(z.prettifyError(parsed.error)),
		};
	}

	const { environment, verbose } = parsed.data;
	if (!verbose) {
		return { ok: true, data: { status: "ok", environment } };
	}

	return {
		ok: true,
		data: {
			status: "ok",
			environment,
			checks: [{ name: "environment", status: "ok" }],
		},
	};
}
