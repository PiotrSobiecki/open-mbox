# Astro on Cloudflare

*AI agent index: [llms.txt](./llms.txt) — generated from `AGENTS.md` and `.claude/` by `pnpm gen:llms-txt`, served at `/llms.txt`*

A production-ready **template** for building content-first sites and SSR apps on Cloudflare Workers with Astro. Ships with Tailwind CSS v4, native Astro API endpoints, a strict Biome + Vitest toolchain, an optional Drizzle + Neon data layer, and the full Auditmos baseline (simple-git-hooks, knip, taze, semantic-release, `.claude/` rules).

Use it as the starting point for your next project — clone it, rename it, decide whether you want the data layer, and start shipping.

## Using this Template

1. Click **Use this template** on GitHub (or `gh repo create --template`).
2. `pnpm install`.
3. `pnpm run init-project` — prompts for a kebab-case project name, renames `wrangler.jsonc` + `package.json`, and fans out `.env.example` → `.env` and `.dev.vars{,.staging,.production}.example` → `.dev.vars` / `.dev.vars.staging` / `.dev.vars.production`. Pass `--with-db` to add the Drizzle/Neon data layer scaffolding. Idempotent — re-runnable, never overwrites filled-in files.
4. *(Only if `--with-db`)* Provision a Neon database and fill `DATABASE_HOST/USERNAME/PASSWORD` in `.dev.vars` (and the staging/production variants when you deploy them).
5. Run `pnpm cf-typegen && pnpm dev`.

See [Quick Start](#quick-start) below for the dev-loop commands.

## Why this template

- **Edge-first** — Astro `output: "server"` running on Cloudflare Workers via `@astrojs/cloudflare`. Bindings typed automatically through `worker-configuration.d.ts`.
- **No framework lock-in** — pure Astro by default. Add React/Vue/Svelte islands per project with `pnpm astro add <integration>` only when you actually need them.
- **Type-safe end-to-end** — `astro check` + strict TypeScript, Zod at every endpoint boundary, typed Cloudflare `Env`.
- **Three-env wrangler** — `dev`, `staging`, `production` blocks shipped out of the box, one Worker each. Deploy with `pnpm deploy:staging` / `pnpm deploy:production`.
- **Agent-friendly** — project rules in `.claude/rules/` activate automatically based on the files you touch. Mirrors the conventions of every other Auditmos template repo (`saas-on-cf`, `tstack-on-cf`, `hono-on-cf`).

## Quick Start

```bash
# Install dependencies
pnpm install

# Generate Cloudflare Env types
pnpm cf-typegen

# Start the dev server
pnpm dev
```

The app runs on http://localhost:3000.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Dev server on port 3000 (Astro + Vite) |
| `pnpm build` | Production build to `./dist` |
| `pnpm preview` | Preview the production build locally |
| `pnpm deploy:dev` / `pnpm deploy:staging` / `pnpm deploy:production` | Build and deploy to the named Cloudflare environment |
| `pnpm cf-typegen` | Generate `Env` types from `wrangler.jsonc` |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` | Vitest |
| `pnpm types` | `astro check` + `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | Biome check / auto-fix |
| `pnpm knip` | Detect unused files, deps, and exports |
| `pnpm deps` / `pnpm deps:update` | Check / apply dependency updates via taze |
| `pnpm deps:major` / `pnpm deps:major:update` | Show / apply major updates — a decision, never automated |
| `pnpm deps:major:report` | Report pending majors into the tracking issue (`--dry-run` prints it instead) |
| `pnpm release` | semantic-release (CI only) |

If you opted into the data layer with `--with-db`, you also get `db:generate:{dev,staging,production}`, `db:migrate:*`, `db:pull:*`, `db:studio`, and `db:seed:*` — all wired through `@dotenvx/dotenvx`.

## Project Structure

```
src/
├── pages/                       # File-based routes
│   ├── index.astro              # Landing page
│   ├── sitemap.xml.ts           # Sitemap route (SSR — nothing here is prerendered)
│   ├── robots.txt.ts            # Robots route, pointing at the sitemap
│   └── api/                     # API endpoints (./api/<name>.ts)
│       └── health.ts            # Exemplar: parse, delegate, respond
├── health/                      # The pure module it delegates to, plus its tests
├── seo/                         # Sitemap, robots and link-preview tags
├── middleware.ts                # Renders, then applies the security-header baseline
├── security-headers/            # That baseline — the only place a header is named
├── layouts/
│   └── Layout.astro             # Shared HTML shell
├── styles/
│   └── globals.css              # Tailwind v4 entry
└── env.d.ts                     # App.Locals typed against CF Env
```

Path alias `@/*` resolves to `src/*`.

Reusable components get their own folder under `src/` when a second page needs one,
and a domain module gets `src/<domain>/` when the domain appears — following
`src/health/`. The template ships no empty directories waiting to be filled.
`docs/` holds business requirements and design docs; `plans/` holds phased
implementation plans.

## Cloudflare Integration

### Worker configuration

[`wrangler.jsonc`](./wrangler.jsonc) is the source of truth — read the values there,
not here. This README used to reproduce the file inline, which meant the weekly
dependency bot bumped the real compatibility date and left the copy a little more
wrong every time. The copy is gone rather than synced: teaching the bot to rewrite
prose automates a problem better deleted. `scripts/docs-truth.test.ts` fails if a
copy is reintroduced.

What the file declares:

- Worker name, entrypoint, compatibility date and flags (`nodejs_compat`)
- `assets` — `./dist` served through the `ASSETS` binding
- `observability` with an explicit head sampling rate, plus source map upload
- Three `env` blocks — `dev`, `staging`, `production` — one Worker each
- Commented example blocks for the bindings you are most likely to add next

Conventions:

- Use `wrangler.jsonc`, not `.toml`.
- Prefer `custom_domain: true` over routes with `zone_name` — see [`.claude/rules/cloudflare-deployment.md`](./.claude/rules/cloudflare-deployment.md).
- Run `pnpm cf-typegen` whenever you add bindings to regenerate `worker-configuration.d.ts`.

### Accessing bindings

```ts
// src/pages/api/hello.ts
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = () => Response.json({ env: env.CLOUDFLARE_ENV });
```

In Astro v6 + `@astrojs/cloudflare` v13 the `Astro.locals.runtime` proxy is gone — `import { env } from "cloudflare:workers"` is the only supported path for bindings and vars.

### Secrets & environments

Per-environment vars live in `.dev.vars` / `.dev.vars.staging` / `.dev.vars.production`, never committed. This matches the wrangler convention — `.dev.vars.<env>` is loaded ahead of `.dev.vars` when `CLOUDFLARE_ENV=<env>` is set ([docs](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets)). For staging/production, mirror the same keys as Cloudflare secrets via `wrangler secret put --env <name>`.

### Site URL, sitemap and robots

`astro.config.mjs` reads the site origin from `SITE_URL`, falling back to a
placeholder. It is a **build-time** value — not a Worker binding — so it is set on
the build, and every deploy script builds first:

```bash
SITE_URL=https://staging.example.com pnpm deploy:staging
```

That origin is what canonical URLs, `/sitemap.xml` and `/robots.txt` resolve
against. Left unset, all three fall back to the origin the request arrived on,
which is right often enough to be safe and never as good as configuring it.

Both files are routes rather than static assets ([`src/pages/sitemap.xml.ts`](./src/pages/sitemap.xml.ts),
[`src/pages/robots.txt.ts`](./src/pages/robots.txt.ts)) — this template renders on
demand and prerenders nothing, so a build-time sitemap integration would have no
routes to enumerate. Link-preview tags come from the same module,
[`src/seo/`](./src/seo/), driven by the layout's `title` and `description` props.

### Deploying

```bash
pnpm deploy:dev         # build + wrangler deploy --env dev
pnpm deploy:staging     # build + wrangler deploy --env staging
pnpm deploy:production  # build + wrangler deploy --env production
```

Every deploy command names its environment, and there is deliberately no environment-less one. The old bare script was unreachable — `deploy` is a pnpm built-in (workspace deploy), so the package manager answered instead of the script — and the wrangler invocation it wrapped published to the *top-level* Worker, which none of the three `env` blocks owns. That is a fourth live Worker nobody manages. `scripts/deploy-scripts.test.ts` fails if such a script is reintroduced.

**Deploys are manual by design.** CI gates lint, types, tests, dead code and the production build, but never ships — a template its consumers clone must not demand a `CLOUDFLARE_API_TOKEN` they have not created. To automate it for your own project, add a workflow step running one of the commands above with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the job environment; see [Wrangler CI/CD](https://developers.cloudflare.com/workers/wrangler/ci-cd/).

## Optional: Drizzle + Neon data layer

Re-run `pnpm run init-project --with-db` (or pass the flag the first time) to scaffold:

- `drizzle-{dev,staging,production}.config.ts`
- `src/db/{client,health,schema.ts,setup.ts}`
- `db:*` scripts wired through `@dotenvx/dotenvx`
- `DATABASE_HOST/USERNAME/PASSWORD` keys in every `.dev.vars{,.staging,.production}.example`

Same conventions as `tstack-on-cf` and `hono-on-cf`: domain-per-folder, narrow public API, per-env migration directories.

## Agent Rules & Design Docs

This template is set up for agent-assisted development:

- `CLAUDE.md` → symlink to `AGENTS.md` — project-wide agent guide.
- `.claude/rules/` — topic rules (`general.md`, `deep-modules.md`, `error-handling.md`, `atomic-imports.md`, `cloudflare-deployment.md`, plus `frontend/{astro,tailwind-v4}.md` and `api/astro-endpoints.md`) that load in every session.
- `.claude/agents/` — `dd-w` (design-doc writer), `dd-i` (design-doc implementer), `mvp-e` (MVP enforcer).
- `/docs` — single source of truth for business requirements / design docs.
- `llms.txt` — the agent index, **generated** from the two above by `pnpm gen:llms-txt`. `public/llms.txt` symlinks to it so a deployed clone serves it at `/llms.txt`; there is no second copy to keep in sync. A drift test fails if the committed file falls behind the tree.

## Learn More

- **[Astro](https://docs.astro.build/)** — content-first framework with islands architecture
- **[@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)** — Cloudflare Workers adapter
- **[Tailwind CSS v4](https://tailwindcss.com/docs/installation/using-vite)** — utility-first CSS, configured via CSS
- **[Cloudflare Workers](https://developers.cloudflare.com/workers/)** — edge computing platform
- **[Biome](https://biomejs.dev/)** — fast formatter and linter
- **[Drizzle ORM](https://orm.drizzle.team/)** *(when `--with-db`)* — type-safe SQL
- **[Neon](https://neon.tech/)** *(when `--with-db`)* — serverless Postgres

## License

Open source under the [ISC License](LICENSE).
