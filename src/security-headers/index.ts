/**
 * Security-headers policy (issue #25).
 *
 * The interface is two exports: the header set and the function that applies it.
 * Everything else — which protections ship enabled, what each value is, what
 * happens when a response arrives with immutable headers — is implementation.
 * `src/middleware.ts` calls `applySecurityHeaders` and knows nothing else, which
 * is what makes adding or changing a header a one-file edit.
 *
 * **Why middleware and not a `public/_headers` file.** A static headers file is
 * applied by the assets layer only, and this template renders most of its
 * responses on demand — so the file would decorate the favicon and miss every
 * page. Duplicating the policy into one *would* cover assets, at the cost of two
 * places to edit and one of them silently drifting. Middleware covers what SSR
 * emits; a clone that wants headers on static assets too can add `public/_headers`
 * and own the duplication deliberately.
 *
 * **Why the route wins.** Values are filled in, never overwritten. A route that
 * sets `x-frame-options` itself has made an explicit decision — an embeddable
 * page, a deliberately relaxed endpoint — and a baseline that clobbered it would
 * make that decision unexpressible. Absence is what this module fixes.
 */

/**
 * The baseline. Five protections, lower-cased because that is how `Headers`
 * reports names back and the tests compare against this object directly.
 *
 * - `strict-transport-security` — one year, subdomains included. `preload` is
 *   deliberately absent: submission to the browser preload list is slow to
 *   reverse and is a decision for a real domain, not for a template.
 * - `x-content-type-options` — no MIME sniffing.
 * - `referrer-policy` — full URL to same origin, bare origin cross-origin.
 * - `x-frame-options` — no framing. `frame-ancestors` in a content-security-policy
 *   supersedes this header, so a clone that enables the policy below can drop it.
 * - `permissions-policy` — the powerful features this template does not use.
 *   Denying them costs nothing here and is one edit away for a clone that does.
 *
 * The content-security-policy is deliberately **not** in this set. A useful policy
 * depends on what each clone adds — an analytics snippet, an interactive island,
 * an embedded frame — and one inherited from a template breaks on the first of
 * them, in production, with an empty page and a console error as the only clue.
 * An absent policy is a known gap; a broken one is a debugging session. Start from
 * this and tighten it against your own build:
 *
 *   "content-security-policy":
 *     "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
 *     "script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
 *
 * Report-only first (`content-security-policy-report-only`) is the cheap way in:
 * the browser reports what the policy would have blocked without blocking it.
 */
export const SECURITY_HEADERS = {
	"strict-transport-security": "max-age=31536000; includeSubDomains",
	"x-content-type-options": "nosniff",
	"referrer-policy": "strict-origin-when-cross-origin",
	"x-frame-options": "DENY",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const satisfies Record<string, string>;

/**
 * Fill the baseline into a response and hand it back.
 *
 * Total: it never throws and never drops a response. Most responses have mutable
 * headers and are decorated in place — which matters, because rebuilding a
 * response discards anything the constructor cannot carry, a WebSocket upgrade
 * among them. The ones that refuse mutation — anything from `Response.redirect`,
 * or forwarded from a `fetch` — carry an immutable header guard and are rebuilt
 * around the same body, status and status text. Absorbing that difference is the
 * reason this is a function rather than a loop in the middleware.
 */
export function applySecurityHeaders(response: Response): Response {
	const missing = Object.entries(SECURITY_HEADERS).filter(([name]) => !response.headers.has(name));
	if (missing.length === 0) return response;

	try {
		for (const [name, value] of missing) response.headers.set(name, value);
		return response;
	} catch {
		const headers = new Headers(response.headers);
		for (const [name, value] of missing) headers.set(name, value);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
}
