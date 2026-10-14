// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	output: "server",

	// Astro 7 defaults to "jsx", which drops the newline between text and an inline
	// element. "true" is the v6 behaviour.
	compressHTML: true,

	// The origin canonical URLs, the sitemap and robots.txt resolve against. Read
	// from the environment because the value is per-clone and per-environment, and
	// baked at build time — `SITE_URL=https://staging.example.com pnpm deploy:staging`
	// carries it through, since every deploy script builds first.
	//
	// Unset, `site` stays undefined and src/seo/ resolves against the origin the
	// request arrived on. The template's "https://example.com" placeholder made that
	// branch unreachable and shipped example.com as the canonical URL. `||`, not
	// `??`: GitHub Actions passes an unset variable as an empty string.
	site: process.env.SITE_URL || undefined,

	// The page's content security policy. It lives here rather than in
	// src/security-headers/ because only Astro knows the hashes of the inline scripts
	// it emits for island hydration; for pages rendered on demand, which is every page
	// here, Astro sends it as a response header. HTML mail renders in a srcdoc iframe,
	// which inherits this policy: img-src is what keeps remote images and tracking
	// pixels from loading, and style-src stays 'unsafe-inline' because mail is styled
	// inline (Astro then emits no style hashes, which would cancel it). font-src allows
	// data: because the build inlines the smallest font subsets.
	security: {
		csp: {
			scriptDirective: { resources: ["'self'"] },
			styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
			directives: [
				"default-src 'self'",
				"img-src 'self' data:",
				"font-src 'self' data:",
				"connect-src 'self'",
				"worker-src 'self'",
				"frame-src 'none'",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'none'",
				"frame-ancestors 'none'",
			],
		},
	},

	adapter: cloudflare({
		// Left unset, the adapter picks `cloudflare-binding` and writes an
		// `images: { binding: "IMAGES" }` into its generated config that nobody
		// chose — a runtime dependency on a paid product, plus a dashboard step
		// every clone has to discover for itself. Compiling at build time and
		// passing through at runtime is the right default for a mostly-static
		// template: transforms happen once, on our machine, and the deployed
		// Worker needs no image binding at all.
		//
		// Need remote or on-demand transforms? Set `runtime: "cloudflare-binding"`,
		// enable Cloudflare Images on the zone, and add an `images` binding to
		// wrangler.jsonc — the adapter will use yours rather than inventing one.
		// https://developers.cloudflare.com/images/transform-images/bindings/
		imageService: { build: "compile", runtime: "passthrough" },
	}),

	vite: {
		plugins: [tailwindcss()],
		// Emits .js.map alongside the Worker bundle. wrangler.jsonc sets
		// upload_source_maps so production stack traces resolve to source.
		build: { sourcemap: true },
	},

	integrations: [react()],
});
