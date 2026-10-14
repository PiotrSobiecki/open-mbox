// @ts-check
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	output: "server",
	// The origin canonical URLs, the sitemap and robots.txt resolve against. Read
	// from the environment because the value is per-clone and per-environment, and
	// baked at build time — `SITE_URL=https://staging.example.com pnpm deploy:staging`
	// carries it through, since every deploy script builds first.
	//
	// The fallback is a placeholder on purpose: it is visibly wrong in a sitemap,
	// where a plausible-looking guess would not be. Unset, the endpoints and the
	// layout fall back to the origin the request arrived on rather than to this.
	site: process.env.SITE_URL ?? "https://example.com",
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
});
