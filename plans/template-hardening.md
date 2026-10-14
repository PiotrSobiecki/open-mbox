# Plan: Template Hardening — deployable, honest, and current

> Source PRD: [#17 — Make astro-on-cf deployable, honest, and current](https://github.com/auditmos/astro-on-cf/issues/17)
> Audit with exact file/line locations for every finding: [#16](https://github.com/auditmos/astro-on-cf/issues/16) (closed, superseded)

## Status

**Delivered — 2026-08-08.** All ten phase issues (#18–#27) are closed and the PRD (#17) is closed.
63 of the 66 acceptance criteria below are ticked against verification, not against
recollection: the check suite (`pnpm test`, `pnpm types`, `pnpm lint`, `pnpm knip`,
`pnpm build`, all exit 0), plus a `pnpm preview` run of the built Worker for every
criterion phrased as runtime behaviour — the five security headers present and the
content-security-policy absent, `/llms.txt`, `/robots.txt` and `/sitemap.xml` all 200,
the link-preview tags emitted, and `/api/health` answering 200 and 400. The two
criteria phrased as *removals* were verified by performing the removal: deleting a
rule file turns the drift test red, and restoring it turns it green.

Three criteria are left unticked with the reason recorded inline — two in Phase 2,
one in Phase 4. None blocks the PRD, and the Phase 4 one is a genuine cross-phase
regression rather than work that was skipped. They are listed together in
[Known gaps](#known-gaps) below.

## Issue map

Each phase is tracked by one issue, labelled `template-hardening`. All are AFK — the PRD resolved every decision, so none needs input before it can be picked up.

| Phase | Issue | Blocked by |
|---|---|---|
| 1 — CI build gate | [#18](https://github.com/auditmos/astro-on-cf/issues/18) | — *(land first; the rest merge through it)* |
| 2 — Deploy path correct | [#19](https://github.com/auditmos/astro-on-cf/issues/19) | — |
| 3 — Agent index | [#20](https://github.com/auditmos/astro-on-cf/issues/20) | — |
| 4 — Exemplar endpoint and module | [#21](https://github.com/auditmos/astro-on-cf/issues/21) | — |
| 5 — Documentation tells the truth | [#22](https://github.com/auditmos/astro-on-cf/issues/22) | #21 |
| 6 — Repository hygiene | [#23](https://github.com/auditmos/astro-on-cf/issues/23) | — |
| 7 — Adapter decisions explicit | [#24](https://github.com/auditmos/astro-on-cf/issues/24) | — |
| 8 — Security headers | [#25](https://github.com/auditmos/astro-on-cf/issues/25) | — |
| 9 — Production web hygiene | [#26](https://github.com/auditmos/astro-on-cf/issues/26) | — |
| 10 — Major-upgrade surfacing | [#27](https://github.com/auditmos/astro-on-cf/issues/27) | — |

#19 and #24 both extend the same configuration contract test — a merge conflict risk rather than a dependency, so neither blocks the other. Avoid working them concurrently.

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture style**: single-repo Astro SSR template on Cloudflare Workers. Not a monorepo — the workspace manifest exists for other reasons and is precisely what shadows the deploy command in Phase 2.
- **Verification style**: **contract tests over configuration.** Every configuration claim this plan makes gets an assertion that fails when the claim stops being true. This extends the convention the repo already established for the observability block and is the single decision that keeps this work from decaying into a one-time cleanup. It cross-cuts phases 2, 3 and 7.
- **Module style**: deep modules. Pure logic lives in testable modules with narrow exported interfaces; framework boundaries (endpoints, middleware) are thin shells that parse, delegate, and construct responses. Page and endpoint files stay outside unit-test discovery by existing convention — the module beneath is the test target. If a shell needs its own test, the split is wrong.
- **Deploy model**: manual, laptop-driven, per-environment. No CI deploy ships. CI gates the build only. A template that others clone must not require a Cloudflare API token its consumers have not created. Every deploy path names its environment explicitly; the environment-less path is removed rather than documented around.
- **Generated-file policy**: generated files are untracked and regenerated on install. The install hook is the guarantee that untracking costs a fresh clone nothing.
- **Documentation policy**: documentation is generated from the source of truth or carries a placeholder pointing at it. A hand-maintained copy of a value that lives elsewhere is treated as a defect, not a convenience — that pattern produced both the wrong agent index and the stale config snippet.
- **Key artifacts** (this is infrastructure, not a data model): the Worker configuration with its three environment blocks; the rules tree; the generated agent index derived from it; the package script surface; the CI workflow set.
- **Version constraint**: Astro 6 and adapter 13 stay pinned for the duration of this plan. Phase 10 makes major upgrades *visible*; it does not perform them. Adapter 14 tracks the Cloudflare Vite plugin path and would change build and deploy assumptions that phases 1, 2 and 7 are simultaneously repairing.

**Phase ordering rationale.** Phase 1 goes first because it is the net every later phase merges through; landing it after the configuration work means that work merges ungated. Phases 2–5 are the PRD's P0/P1 set. Phases 6–10 are P1/P2 and can be reordered freely among themselves.

---

## Phase 1: CI build gate

**User stories**: 6, 7, 8

### What to build

A CI workflow that runs on pull requests and on pushes to main, executing lint, type check, test, dead-code check, **and the production build**. The build step is the point of the phase — the existing release pipeline runs everything *except* the build, so a change that breaks production compilation currently merges green and is discovered on a laptop at deploy time.

The same build step is added to the release pipeline, so neither path can cut from a state that does not build.

This also closes the acknowledged gap where the weekly dependency pull requests merge without independent CI: once the workflow triggers on pull requests, bot PRs are gated by the same checks as human ones.

Mind the existing environment guard around git hooks in CI — the release workflow already documents why the hook installer is skipped there, and the new workflow needs the same treatment for the same reason.

### Acceptance criteria

- [x] A workflow runs on `pull_request` and on pushes to main
- [x] It runs lint, type check, test, dead-code check, and the production build
- [x] A pull request containing a deliberate build-breaking change fails CI, where lint, types and test alone would have passed
- [x] The release pipeline also runs the build before releasing
- [x] A weekly dependency pull request shows the same checks as a human-authored one
- [x] Git hooks are not installed into the CI runner (matching the existing guard and its documented rationale)

---

## Phase 2: Deploy path correct end to end

**User stories**: 1, 2, 3, 4, 5, 9, 10

### What to build

The complete deploy story: the right command, an explicit environment, and a readable stack trace when it breaks.

Today the documented deploy command collides with a reserved package-manager command name and errors out. The obvious workaround succeeds but targets a top-level Worker that none of the three declared environments owns — creating a fourth live, unmanaged Worker that is easy not to notice.

Replace the colliding script with explicit per-environment deploy commands that always name their environment. Make the environment-less path fail rather than leaving it as a footgun with a warning beside it. Add a contract test asserting that every script invoking a deploy carries an explicit environment flag, so the fourth-Worker mistake cannot be reintroduced by a later edit.

Enable source map upload in the Worker configuration, so production traces point at real source lines instead of minified output — observability is already switched on, which makes the missing upload a half-configured state rather than an absent one.

Update both the README and the agent-facing project doc to print commands that run as written, and state that manual deploys are a decision rather than a missing feature.

### Acceptance criteria

- [x] Separate staging and production deploy commands exist, each naming its environment explicitly
- [x] The previously colliding script name no longer resolves to the package manager's built-in command
- [ ] A deploy invoked without an environment fails rather than targeting the top-level Worker — **partially met.** No script or documented command reaches the bare path, and `scripts/deploy-scripts.test.ts` fails if one is added back. But `wrangler.jsonc` still carries a top-level `name`, so a hand-typed `wrangler deploy` succeeds and creates the fourth Worker. Made unreachable, not made to fail.
- [x] A contract test asserts every deploy-invoking script carries an explicit environment flag, and fails if a bare deploy script is added
- [x] Source map upload is enabled in the Worker configuration, asserted by the contract test
- [x] Every deploy command printed in the README and the agent-facing project doc runs as written
- [x] The manual-deploy decision is documented as deliberate, with a pointer for consumers who want to automate it per-project
- [ ] Every Worker in the account corresponds to a declared environment block — **not verifiable from the repository.** Needs an inventory of the Cloudflare account, and wrangler exposes no list-all-scripts command. Left open deliberately: the repository can assert what it deploys, not what already exists in an account.

---

## Phase 3: Agent index generated, served, and drift-tested

**User stories**: 11, 12, 13, 14, 15, 16, 41

### What to build

The agent index is currently a verbatim copy from a sibling template: it announces the wrong project, describes a stack this repo does not contain, and links nine rule files that do not exist here. The README advertises it as *the* index for AI agents, so an agent that trusts the repository's own documentation is reliably wrong about the repository.

Build a pure module that walks the rules tree and emits the index — correct title, correct summary, and a link for every rule file that actually exists. Add a drift test that regenerates from the real tree and fails if the committed copy is stale.

This is chosen over hand-writing with a link-existence check because the failure that produced the current file was a **whole-file copy**, which link checking would not have caught: not the wrong title, not the wrong stack description, and not a newly added rule missing from the index. Generating makes the entire class unrepresentable.

Ship the result into the public assets directory so the deployed origin serves it at the conventional path — today it exists at the repo root only, so the deployed site serves nothing. Resolve the root and served copies to a single source rather than maintaining two.

The index carries the template's name, so the project-initialization script must rewrite it during scaffolding alongside the other name-carrying files it already handles.

### Acceptance criteria

- [x] A pure builder module emits the index from the rules tree, unit-tested at its exported boundary over a fixture tree
- [x] The generated index states this project's name and an accurate one-line summary
- [x] Every rule file present in the tree appears in the index
- [x] Every link in the index resolves to a path that exists
- [x] A drift test regenerates from the real tree and fails when the committed copy is stale
- [x] Deleting a rule file, adding one, or renaming the project each turn the drift test red
- [x] The index is present in build output and served at the conventional path by a deployed clone
- [x] Exactly one source of truth for the file — no hand-maintained second copy
- [x] Scaffolding a new project rewrites the project name in the index

---

## Phase 4: Exemplar endpoint and module

**User stories**: 18, 19, 20

### What to build

The rules prescribe schema-validated API endpoints and boundary-tested modules, in a repository that has neither an API directory nor a validation library. An agent following a prescription with no working referent produces inconsistent results, so the gap is closed by shipping the example rather than by marking the rules aspirational.

Add one health endpoint that validates at the boundary and is a thin shell over a pure module: the module owns what health means and what it reports, the endpoint only parses, delegates, and constructs a response. The module gets a real boundary test covering both the success shape and the validation-failure shape.

The point is demonstrative as much as functional — this is the split the testing rules mandate, made concrete and verifiable. The endpoint stays outside test discovery by existing convention, which is exactly why the module beneath it exists.

Keep it genuinely minimal so that a consumer who does not want it can delete it in one step. Add the validation library as a dependency and make sure the dead-code check accounts for the new entry points.

### Acceptance criteria

- [x] A health endpoint exists, validating its input at the boundary
- [x] The endpoint's logic lives in a pure module with a narrow exported interface
- [x] The module has a boundary test covering the success shape and the validation-failure shape
- [x] The endpoint file contains only parsing, delegation and response construction — no logic needing its own test
- [x] The response sets an explicit status in every path
- [x] The validation library is a declared dependency and the dead-code check passes
- [ ] Removing the exemplar is a single deletion that leaves the template green — **regressed by Phase 5.** It held when this phase landed: `knip.jsonc` still documents the `zod` ignore added so deleting the exemplar would not turn the dead-code check red. Phase 5 then pointed the docs at `src/health/` and `src/pages/api/health.ts` (four pointers in `AGENTS.md`, one in the README), and `scripts/docs-truth.test.ts` fails when a documented path stops existing. Deleting the exemplar is now a deletion plus a five-line docs edit.

---

## Phase 5: Documentation tells the truth

**User stories**: 17, 21, 22

**Depends on Phase 4** — the structural-claims criterion below cannot be verified until the exemplar has created the API directory those docs describe.

### What to build

Remove every remaining claim the repository makes about itself that is not true.

The agent-facing project doc names a requirements directory as the single source of truth for business requirements; that directory has never existed, so a documented source of truth is a dead pointer. Create it with a stub explaining what belongs there.

The README embeds a configuration snippet containing a literal compatibility date that has already drifted from the real value — and the weekly bot makes it staler on every bump. Replace the literal with a placeholder pointing at the real configuration file. This removes the drift surface rather than automating a sync: extending the bot to rewrite the README automates a problem better deleted, and a drift test would turn every legitimate configuration edit into a two-file edit.

Reconcile the remaining structural claims in the README and the project doc with the directories that actually exist — including the API directory Phase 4 has now created.

### Acceptance criteria

- [x] The requirements directory named in the project doc exists, with a stub describing its purpose
- [x] No pointer in the project doc resolves to a path that does not exist
- [x] The README's configuration snippet contains no literal value that the automated bots can make stale
- [x] The snippet points at the real configuration file as its source of truth
- [x] Structural claims in the README and project doc match the directories actually present after Phase 4

---

## Phase 6: Repository hygiene

**User stories**: 32, 33, 34, 38, 39, 40

### What to build

Four small maintenance fixes that share one verification: a clean working tree and a green toolchain.

The generated type file is git-tracked *and* listed in the ignore file — an ignore entry has no effect on an already-tracked file, so the repository states two contradictory intents and every dependency bump lands a half-megabyte diff. Untrack it; the install hook already regenerates it, so a fresh clone is covered.

The declared Node floor and the type packages say one major version while CI resolves the current LTS, which is a different one. Converge all three on the current LTS: the template should scaffold onto a runtime that is not approaching end of life.

The linter is pinned to an exact version, which means the weekly bot can never move it. Unpin it so it tracks like everything else.

The dead-code configuration ignores a dependency copied from a sibling template that this repository has never had. Delete the ignore.

### Acceptance criteria

- [x] The generated type file is untracked, and its ignore entry is now effective rather than decorative
- [x] Regenerating types leaves the working tree clean
- [x] A fresh clone produces working types after install, with no manual step
- [x] The declared runtime floor, the type packages, and the version CI resolves are the same major
- [x] The linter is no longer pinned to an exact version, or its pin is documented with a reason
- [x] The dead-code configuration contains no ignore for a dependency absent from the manifest
- [x] The full check suite passes after all four changes

---

## Phase 7: Adapter decisions made explicit

**User stories**: 26, 27, 28, 31

### What to build

Every implicit decision the Cloudflare adapter currently makes on the template's behalf becomes explicit, commented, and asserted.

The adapter is configured with no options at all, so the build silently emits image-service chunks and an implicit image binding nobody chose. Pin the image service to build-time compilation — the right default for a mostly-static template: no runtime binding, no per-clone dashboard setup, no dependency on a paid product. Document the runtime alternative for consumers who need remote or on-demand images.

The adapter also emits a session key-value binding with no namespace identifier into its generated configuration, which means the first use of sessions fails at deploy time. Resolve it deliberately — either pre-wire it as a commented block matching the existing commented binding examples, or disable sessions explicitly — so it is a visible choice rather than a latent failure.

Add the assets-routing options as commented entries with a one-line rationale, so a template consumer can see which knobs exist and that the current values were chosen rather than defaulted into.

Extend the configuration contract test to cover these decisions, so removing any of them turns the suite red.

### Acceptance criteria

- [x] The image service is pinned explicitly, with the rationale and the alternative recorded in a comment
- [x] The build emits no image-service chunks or implicit image binding that was not deliberately chosen
- [x] The session binding is resolved deliberately — pre-wired as a commented block, or explicitly disabled
- [x] First use of sessions in a clone does not fail at deploy time for want of a namespace identifier
- [x] Assets-routing options are present and commented with a one-line rationale
- [x] The configuration contract test asserts each of these decisions and fails if any is removed

---

## Phase 8: Security headers baseline

**User stories**: 23, 24, 25

### What to build

There is no middleware and no static headers file, so SSR responses ship with no transport, content-type, referrer, framing or permissions protections at all. A freshly deployed clone is missing the baseline entirely.

Build the policy as a pure module with a narrow interface, unit-testable without constructing a request pipeline, and add middleware that is a thin caller. The middleware must contain no policy logic of its own — if it does, the split is wrong.

Ship the transport, content-type, referrer, framing and permissions headers enabled. Ship the content-security-policy **commented, with an explanatory note**: a real policy depends on what each clone adds, and a broken inherited policy that fails on someone's first interactive island is worse than an absent one. A static headers file was considered and rejected as the primary mechanism, because it does not cover SSR responses — which is most of this template.

### Acceptance criteria

- [x] A pure policy module exports the header set, unit-tested at its boundary
- [x] Middleware applies the policy to SSR responses and contains no policy logic itself
- [x] Transport, content-type, referrer, framing and permissions headers are present on a deployed response
- [x] The content-security-policy ships commented, with a note explaining why it is opt-in
- [x] The commented policy does not appear in emitted headers
- [x] Adding or changing a header requires editing only the module

---

## Phase 9: Production web hygiene

**User stories**: 29, 30

### What to build

The basics a template should scaffold with, so a deployed clone is indexable and shares correctly without the consumer assembling them by hand.

Configure the site URL from the environment, add sitemap generation, and add a robots file pointing at the sitemap. Extend the shared layout with Open Graph, Twitter and canonical tags — it currently carries only a description, a viewport, icons and a title, so any link to the site renders as a bare URL when shared.

Keep the layout's existing prop interface as the input for these tags rather than introducing a parallel mechanism.

### Acceptance criteria

- [x] The site URL is configured and environment-driven
- [x] A deployed clone serves a sitemap
- [x] A robots file is served and points at the sitemap
- [x] The shared layout emits Open Graph, Twitter and canonical tags
- [x] Those tags are driven by the layout's existing props, with sensible defaults
- [x] A link to a deployed clone renders a title, description and canonical URL when shared

---

## Phase 10: Major-upgrade surfacing

**User stories**: 35, 36, 37

### What to build

The weekly dependency bot runs in minor mode, so major upgrades never appear in any pull request and accumulate invisibly — Astro 7, the adapter, the compiler and the linter among them.

Add a scheduled job that reports pending majors into a single issue: opening it when majors first appear, updating it in place afterwards. Updating rather than re-opening matters — an automation that files a fresh issue every run becomes noise people learn to ignore, which reproduces the invisibility it was built to fix.

The report body is produced by a pure formatter over the upgrade tool's output, unit-tested so that a change in that tool's format does not silently start producing empty issues. A run with no pending majors opens nothing.

This phase makes the Astro 7 decision *visible*. It does not make it — that migration is explicitly out of scope for this plan and gets its own PRD once surfaced.

### Acceptance criteria

- [x] A scheduled job checks for pending major upgrades
- [x] A pure formatter turns the tool's output into a report body, unit-tested for both the has-majors and no-majors cases
- [x] A run with pending majors opens an issue the first time and updates the same issue thereafter
- [x] A run with no pending majors opens no issue and leaves any existing one untouched
- [x] A format change in the upstream tool fails the formatter test rather than producing an empty issue
- [x] No major upgrade is performed by this phase

---

## Cross-cutting

**Story 42** — every configuration claim covered by a contract test — is not a phase. It lands inside phases 2, 3 and 7, and is the reason those phases each end with an assertion rather than an edit. It is the difference between this plan being a cleanup and being a ratchet.

**Story 41** — project initialization accounting for name-carrying files — lands in Phase 3, the only phase adding such a file. Any later phase that adds one inherits the same obligation.

**Out of scope for the whole plan**: the Astro 7 / adapter 14 migration; automated deploys; application features or UI framework integrations beyond the single exemplar; changes to the optional data layer or the release process; a tuned content-security-policy; cross-tool agent configuration beyond the generated index.

---

## Known gaps

The three unticked criteria, kept here so they are findable without reading every phase.

**The bare deploy path is unreachable, not fatal** (Phase 2). Every route the repository
offers names an environment, and a contract test keeps it that way — but `wrangler.jsonc`
still carries a top-level `name`, so an operator typing `wrangler deploy` by hand creates
the unmanaged fourth Worker the phase set out to eliminate. Closing this means removing
the top-level `name` and confirming the three environment blocks still resolve without it.

**Account inventory is outside the repository's reach** (Phase 2). Whether every Worker in
the Cloudflare account maps to a declared environment cannot be asserted from here, and
wrangler offers no list-all-scripts command. This is a one-off manual reconciliation, not
a test.

**Phase 5 regressed a Phase 4 guarantee.** The exemplar was built to be deletable in one
step, and `knip.jsonc` still carries the `zod` ignore that was added to protect exactly
that. Phase 5 then made the docs point at `src/health/` and `src/pages/api/health.ts`, so
`scripts/docs-truth.test.ts` — correctly — fails when those paths stop existing. The two
phases are each right on their own terms and jointly turn a one-step deletion into a
six-file edit. Worth resolving deliberately: either describe the exemplar without pointing
at its paths, or accept the docs edit and say so where deletion is documented.

This is the shape the PRD predicted. Its closing note observed that this template family
carries files across without re-grounding them; the same reasoning applies within a plan,
where a later phase can invalidate an earlier phase's acceptance without either phase
being wrong.
