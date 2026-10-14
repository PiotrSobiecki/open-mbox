import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "src"),
		},
	},
	test: {
		globals: true,
		include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
		exclude: ["src/pages/**", "node_modules/**", "dist/**", ".astro/**"],
	},
});
