# Astro API Endpoints

## File layout

- `src/pages/api/<name>.ts` → `/api/<name>` route.
- `src/pages/api/<resource>/[id].ts` → dynamic segment.
- `src/pages/api/<resource>/[...slug].ts` → catch-all when sub-routing in one file.

## Handler shape

```ts
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";

const CreateInput = z.object({ name: z.string().min(1) });

export const POST: APIRoute = async ({ request }) => {
	const parsed = CreateInput.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: parsed.error.message }, { status: 400 });
	}

	// bindings + vars from wrangler.jsonc are typed on `env`
	const _appEnv = env.CLOUDFLARE_ENV;
	// ...mutation
	return Response.json({ ok: true }, { status: 201 });
};
```

## Conventions

- Always validate request body / query / params with Zod **at the boundary**.
- Always set explicit `status` on the `Response`.
- Access Cloudflare bindings through `import { env } from "cloudflare:workers"` — typed via `worker-configuration.d.ts`.
- Don't share request state via module-level mutables — Workers reuse isolates across requests.
- For DB access, call `getDb()` (initialized once per isolate from `src/db/setup.ts` if the data layer is enabled).
- Known failures come back from the domain module as a typed error (see `HealthInputError` in `src/health/index.ts`); the route maps them to status codes. Unexpected errors propagate to Astro's default error handler.

## When to add Hono

This template uses native Astro endpoints. Reach for Hono only when:
- You need shared middleware across many routes (auth, logging, CORS, rate limiting).
- You're building a JSON API with 10+ endpoints and want one router file.
- You want type-safe RPC via `hc<typeof router>`.

In that case mount a single Hono instance under `src/pages/api/[...slug].ts` and call `app.fetch(request, env, ctx)` from the handler.

## Don't

- Don't return raw strings without a `status` — the default 200 hides errors.
- Don't `throw new Error("msg")` — use a typed error class so callers can branch.
- Don't read `process.env` — Cloudflare Workers don't expose it. Use `import { env } from "cloudflare:workers"`.
