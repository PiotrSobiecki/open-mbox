/**
 * Boundary test for the security-headers policy (issue #25).
 *
 * Two things are asserted here, because the phase is a split and a split has two
 * halves that can each go wrong:
 *
 * 1. **The policy**, exercised through its exported boundary — a `Response` in, a
 *    `Response` out. No request pipeline is constructed, which is the whole reason
 *    the policy is a module rather than a body of middleware.
 * 2. **The thinness of the caller.** `src/middleware.ts` is outside test discovery
 *    and has no behaviour of its own to assert, so it is read as text: it must name
 *    no header and no header value. That is what makes "adding or changing a header
 *    means editing one file" a fact rather than an intention.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applySecurityHeaders, SECURITY_HEADERS } from "./index";

const SRC = resolve(import.meta.dirname, "..");
const MIDDLEWARE = readFileSync(resolve(SRC, "middleware.ts"), "utf8");
const POLICY_SOURCE = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");

/** The five protections the PRD ships enabled, by the header that carries each. */
const REQUIRED_HEADERS = [
	["transport", "strict-transport-security"],
	["content type", "x-content-type-options"],
	["referrer", "referrer-policy"],
	["framing", "x-frame-options"],
	["permissions", "permissions-policy"],
] as const;

function headersOf(response: Response): Record<string, string> {
	return Object.fromEntries(response.headers);
}

describe("SECURITY_HEADERS", () => {
	it.each(REQUIRED_HEADERS)("carries the %s protection", (_protection, header) => {
		expect(SECURITY_HEADERS[header as keyof typeof SECURITY_HEADERS]).toBeTruthy();
	});

	it("names every header in lower case, so lookups match what fetch reports", () => {
		const misnamed = Object.keys(SECURITY_HEADERS).filter((name) => name !== name.toLowerCase());
		expect(misnamed).toEqual([]);
	});

	it("ships no content-security-policy, which is opt-in per clone", () => {
		expect(Object.keys(SECURITY_HEADERS)).not.toContain("content-security-policy");
	});
});

describe("applySecurityHeaders", () => {
	it.each(REQUIRED_HEADERS)("sets the %s header on the response", (_protection, header) => {
		const applied = applySecurityHeaders(new Response("body"));

		expect(applied.headers.get(header)).toBe(
			SECURITY_HEADERS[header as keyof typeof SECURITY_HEADERS],
		);
	});

	it("emits no content-security-policy, so the commented policy stays commented", () => {
		const applied = applySecurityHeaders(new Response("body"));

		expect(applied.headers.has("content-security-policy")).toBe(false);
	});

	it("emits exactly the policy and nothing the policy does not name", () => {
		const applied = applySecurityHeaders(new Response(null, { status: 204 }));

		expect(headersOf(applied)).toStrictEqual({ ...SECURITY_HEADERS });
	});

	it("preserves the status, the status text and the body it was handed", async () => {
		const applied = applySecurityHeaders(
			new Response("payload", { status: 418, statusText: "I'm a teapot" }),
		);

		expect(applied.status).toBe(418);
		expect(applied.statusText).toBe("I'm a teapot");
		expect(await applied.text()).toBe("payload");
	});

	it("preserves headers the route already set for its own reasons", () => {
		const applied = applySecurityHeaders(
			new Response("{}", { headers: { "content-type": "application/json" } }),
		);

		expect(applied.headers.get("content-type")).toBe("application/json");
	});

	it("leaves a header the route set deliberately alone — explicit intent wins", () => {
		const applied = applySecurityHeaders(
			new Response("body", { headers: { "x-frame-options": "SAMEORIGIN" } }),
		);

		expect(applied.headers.get("x-frame-options")).toBe("SAMEORIGIN");
	});

	it("applies to a response whose headers are immutable, rather than throwing", () => {
		const redirect = Response.redirect("https://example.com/moved", 302);

		const applied = applySecurityHeaders(redirect);

		expect(applied.status).toBe(302);
		expect(applied.headers.get("location")).toBe("https://example.com/moved");
		expect(applied.headers.get("x-content-type-options")).toBe(
			SECURITY_HEADERS["x-content-type-options"],
		);
	});

	it("is idempotent — a second pass changes nothing", () => {
		const once = headersOf(applySecurityHeaders(new Response("body")));
		const twice = headersOf(applySecurityHeaders(applySecurityHeaders(new Response("body"))));

		expect(twice).toStrictEqual(once);
	});
});

describe("the shipped content-security-policy", () => {
	const mentions = POLICY_SOURCE.split("\n").filter((line) =>
		line.toLowerCase().includes("content-security-policy"),
	);

	it("is present in the module, so a clone has a starting point to uncomment", () => {
		expect(mentions.length).toBeGreaterThan(0);
	});

	it("appears on commented lines only — nothing ships it as code", () => {
		expect(mentions.filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))).toEqual([]);
	});

	it("carries a note explaining why it is opt-in rather than enabled", () => {
		expect(POLICY_SOURCE).toMatch(/island|clone|opt-in/i);
	});
});

describe("middleware", () => {
	it("delegates to the policy module rather than importing a header from elsewhere", () => {
		expect(MIDDLEWARE).toMatch(/from "@\/security-headers"/);
		expect(MIDDLEWARE).toMatch(/applySecurityHeaders\(/);
	});

	it.each(Object.entries(SECURITY_HEADERS))("names neither %s nor its value", (name, value) => {
		expect(MIDDLEWARE.toLowerCase()).not.toContain(name);
		expect(MIDDLEWARE).not.toContain(value);
	});

	it("is thin enough to hold no policy — every header lives in the module", () => {
		const code = MIDDLEWARE.split("\n").filter(
			(line) => line.trim() !== "" && !line.trim().startsWith("*") && !line.trim().startsWith("/*"),
		);
		expect(code.length).toBeLessThanOrEqual(12);
	});
});
