# Open MBOX

*AI agent index: [llms.txt](./llms.txt) — generated from `AGENTS.md` and `.claude/` by `pnpm gen:llms-txt`, served at `/llms.txt`*

A viewer for `.mbox` mail archives — Gmail Takeout, Thunderbird, Apple Mail exports — that runs entirely in the browser. The archive is streamed from disk into a Web Worker and parsed there; it is never uploaded. The Cloudflare Worker behind the site serves the page and nothing else.

- Opens archives of any size by streaming them; the message list fills in while the file is still being read.
- Decodes every message in the charset it declares (ISO-8859-2, Windows-1250, UTF-8…) and shows Gmail labels.
- Searches subject, sender, body, or all of them plus attachment names.
- Lists each message's attachments and downloads them; images the message embeds (`cid:`) show inside it.
- Renders HTML mail in an empty-sandbox iframe under a policy that blocks scripts and every network request, so remote images and tracking pixels never load.

The interface is in Polish.

## Quick Start

Node 24 and pnpm 12 (`engines` and `packageManager` in `package.json`; Corepack supplies pnpm).

```bash
pnpm install
pnpm cf-typegen
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
| `pnpm release` | semantic-release (CI only) |

## Project Structure

```
src/
├── pages/
│   ├── index.astro              # The viewer: one React island, rendered client-side only
│   ├── sitemap.xml.ts           # Sitemap route
│   ├── robots.txt.ts            # Robots route, pointing at the sitemap
│   └── api/
│       └── health.ts            # Liveness endpoint
├── mailbox/                     # mbox splitting, MIME parsing, search, and the Web Worker that owns them
├── viewer/                      # React UI: file picker, message list, message view
├── health/                      # The pure module behind /api/health
├── seo/                         # Sitemap, robots and link-preview tags
├── middleware.ts                # Renders, then applies the security-header baseline
├── security-headers/            # That baseline; the CSP itself is security.csp in astro.config.mjs
├── layouts/
│   └── Layout.astro             # Shared HTML shell
├── styles/
│   └── globals.css              # Tailwind v4 entry
└── env.d.ts                     # App.Locals typed against CF Env
```

Path alias `@/*` resolves to `src/*`. `docs/` holds requirements and design docs.

## How the archive stays local

`src/viewer/` hands the chosen `File` to the worker in `src/mailbox/worker.ts`, which reads it with `File.stream()` and keeps an index in its own memory: headers, a capped body text, attachment names and each message's byte range. Opening a message or downloading an attachment reads that range from the same `File` again, so a large archive costs its index rather than its size. The UI asks the worker for one page of search results or one message at a time. No code path sends file contents over the network, and the page's content security policy (`security.csp` in `astro.config.mjs`) limits `connect-src` to the site's own origin. Closing or reloading the tab discards everything.

HTML bodies render in an `<iframe sandbox="">` whose document starts with its own policy (`default-src 'none'`), so a message can neither run code nor fetch anything — a remote image is how a sender learns that, when and where a message was opened.

## Cloudflare Integration

[`wrangler.jsonc`](./wrangler.jsonc) is the source of truth for the Worker: entrypoint, flags, the `ASSETS` binding, observability, and one Worker per environment (`dev`, `staging`, `production`). Run `pnpm cf-typegen` after changing bindings.

`astro.config.mjs` reads the site origin from `SITE_URL` at build time; canonical URLs, `/sitemap.xml` and `/robots.txt` resolve against it, and fall back to the request's origin when it is unset.

### Deploying

Deploys are manual. From GitHub: **Actions → Deploy → Run workflow**, pick `production` or `staging`. The workflow runs lint, types, tests and knip, then the matching deploy script. It needs two repository secrets — `CLOUDFLARE_API_TOKEN` (a token with the *Edit Cloudflare Workers* template) and `CLOUDFLARE_ACCOUNT_ID` — and reads an optional `SITE_URL` variable from the GitHub environment.

From a machine logged in with `wrangler login`:

```bash
pnpm deploy:staging
pnpm deploy:production
```

Every deploy command names its environment; `scripts/deploy-scripts.test.ts` fails if an environment-less one is added.

### Dependency updates

Dependabot opens update PRs every Wednesday at 14:00 Europe/Warsaw, for npm and for GitHub Actions: minor and patch updates grouped into one PR per ecosystem, each major in its own. CI runs the full gate on every PR; nothing merges or deploys by itself. A separate workflow bumps the Worker's compatibility date when it goes stale.

## Origin

Generated from the Auditmos [astro-on-cf](https://github.com/auditmos/astro-on-cf) template. Agent conventions live in `AGENTS.md` and `.claude/rules/`.

## License

[ISC](LICENSE).
