/**
 * The only middleware this template ships: it renders, then hands the response to
 * the policy in `src/security-headers/`.
 *
 * Nothing here decides anything. No header name, no header value, no exception for
 * a particular route — all of that is the module's, so changing the baseline is one
 * file and one edit. `src/security-headers/index.test.ts` reads this file and fails
 * if a header ever appears in it.
 */

import { defineMiddleware } from "astro:middleware";
import { applySecurityHeaders } from "@/security-headers";

export const onRequest = defineMiddleware(async (_context, next) =>
	applySecurityHeaders(await next()),
);
