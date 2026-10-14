/**
 * Boundary test for the health module (issue #21).
 *
 * This is the exemplar the testing rules describe: `src/pages/**` is outside
 * test discovery, so the endpoint at `src/pages/api/health.ts` is a shell and
 * every assertion below targets the module's exported boundary instead —
 * `checkHealth` in, `HealthResult` out. Nothing here reaches into internals.
 */

import { checkHealth, DECLARED_ENVIRONMENTS, HealthInputError } from "./index";

describe("checkHealth", () => {
	describe("success shape", () => {
		it.each(DECLARED_ENVIRONMENTS)("reports ok for the %s environment", (environment) => {
			expect(checkHealth({ environment })).toStrictEqual({
				ok: true,
				data: { status: "ok", environment },
			});
		});

		it("omits per-check detail unless the caller asks for it", () => {
			const result = checkHealth({ environment: "dev", verbose: "false" });

			expect(result).toStrictEqual({
				ok: true,
				data: { status: "ok", environment: "dev" },
			});
		});

		it("includes per-check detail when the caller asks for it", () => {
			const result = checkHealth({ environment: "production", verbose: "true" });

			expect(result).toStrictEqual({
				ok: true,
				data: {
					status: "ok",
					environment: "production",
					checks: [{ name: "environment", status: "ok" }],
				},
			});
		});
	});

	describe("validation-failure shape", () => {
		it.each([
			["an undeclared environment", { environment: "qa" }],
			["a missing environment", {}],
			["a non-string environment", { environment: 42 }],
			["a verbose flag that is not a boolean literal", { environment: "dev", verbose: "yes" }],
			["a non-object input", "dev"],
			["null", null],
		])("rejects %s", (_case, input) => {
			const result = checkHealth(input);

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected a validation failure");
			expect(result.error).toBeInstanceOf(HealthInputError);
			expect(result.error.name).toBe("HealthInputError");
			expect(result.error.message.length).toBeGreaterThan(0);
		});

		it("never throws — failures are returned, not raised", () => {
			expect(() => checkHealth(undefined)).not.toThrow();
		});
	});

	it("is pure — the same input yields the same report", () => {
		expect(checkHealth({ environment: "staging", verbose: "true" })).toStrictEqual(
			checkHealth({ environment: "staging", verbose: "true" }),
		);
	});
});
