# docs

Single source of truth for **business requirements and design docs**.

`AGENTS.md` points agents here before they design anything, so this directory has
to exist and stay current — a documented source of truth that resolves to nothing
is worse than no pointer at all, which is why `scripts/docs-truth.test.ts` fails
if it goes missing.

## What belongs here

- Product requirements — what the thing must do, and for whom
- Design docs — the shape of a feature before it is built, one file per feature
- Decision records — a choice, the alternatives weighed, and why this one won

## What does not

- **Implementation plans** — those live in `plans/`, phased and issue-linked
- **Reviews, audits and analyses as separate files** — apply review notes and
  status updates *inside* the design doc they concern. A review that lives beside
  the doc it reviews becomes a second source of truth within a week
- **Anything derivable from the code** — the repository already records structure,
  history and configuration; restating it here just creates drift

## Conventions

- One topic per file, `kebab-case.md`
- Open with a one-line statement of the problem, before any solution
- Keep status in the document itself (`Status: draft | approved | shipped`), not
  in a filename or a sidecar file

The template ships this stub only. Delete it once the directory has real content.
