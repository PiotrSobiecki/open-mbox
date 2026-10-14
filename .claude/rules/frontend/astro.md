# Astro

## Pages, layouts, components

- Pages live in `src/pages/`. File path → URL route. `.astro`, `.md`, `.mdx` and `.ts` (endpoints) are valid.
- Layouts in `src/layouts/`. Wrap children with `<slot />`. Re-use across pages.
- A reusable component gets its own folder under `src/` once a second page needs it; there is no `src/components/` waiting for them.
- Path alias `@/*` resolves to `src/*`.

## Server vs client

- Astro components run **server-side at request time** by default (this template uses `output: "server"` on Cloudflare Workers).
- Top frontmatter (`---` block) runs on the server only — DB calls, env access, secrets all fine.
- Hydrate islands with `client:load`, `client:idle`, `client:visible`, `client:media`, `client:only="<framework>"`. Default is **no JS shipped** — only add directives when you need client interactivity.
- This template has no framework integrations (React/Vue/Svelte) by default. Add them with `pnpm astro add react` (etc.) when you actually need an island.

## API endpoints

- File: `src/pages/api/<name>.ts`. Export `const GET`, `POST`, `PUT`, `PATCH`, `DELETE` as named functions of type `APIRoute`.
- Return `new Response(...)` or `Response.json(...)`. Always set explicit `status`.
- Validate input with Zod at the endpoint boundary. Return `400` on parse failure with the error message in body.
- For multi-route APIs use `[...slug].ts` catch-all + a small dispatcher.

## Cloudflare runtime access (Astro v6 + `@astrojs/cloudflare` v13)

- Access bindings via `import { env } from "cloudflare:workers"` — this is now the only supported path in Astro v6. The old `Astro.locals.runtime.env` was removed.
- For request-scoped values: `Astro.request.cf` (CF metadata), global `caches`, `Astro.locals.cfContext` (ExecutionContext).
- `env` is typed automatically via `worker-configuration.d.ts`. Re-run `pnpm cf-typegen` after editing `wrangler.jsonc` bindings.

```ts
import { env } from "cloudflare:workers";

const dbHost = env.DATABASE_HOST; // typed by Cloudflare.Env
```

## Data fetching

- Prefer fetching in the page frontmatter when the data is page-scoped — runs once on the server, ships as HTML.
- Use `Astro.props` to pass server-fetched data to components.
- Don't fetch in client islands unless the data is user-specific or live — prefer SSR.

## Content collections (when adding markdown)

- `src/content/` with a `config.ts` schema (Zod). Type-safe `getEntry()` / `getCollection()`.
- Add the `astro:content` reference to `env.d.ts` if you start using it.

## Generated files — never edit

- `worker-configuration.d.ts` (regen with `pnpm cf-typegen`)
- `.astro/**` (regen on `astro dev` / `astro build` / `astro sync`)
