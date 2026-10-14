# Deep Modules

A deep module (Ousterhout) has a small interface hiding a large implementation.
Deep modules are more testable, more AI-navigable, and let you test at the boundary.

## Principles

- Interface = exports, function signatures, props. Keep narrow.
- Implementation = internal logic. Absorb complexity here.
- Shallow modules (many tiny files doing little) increase system complexity.
- Before creating a new file: does this deepen an existing module or widen its interface?
- Before exporting a function: does the caller need this or is it internal?

## Application

| Layer | Module boundary | Interface | Hides |
|-------|----------------|-----------|-------|
| Domain module | `src/<domain>/index.ts` (`src/health/` is the example) | Exported functions + types | Validation, business rules, error mapping |
| API endpoint | `src/pages/api/<name>.ts` | HTTP route | Nothing: it parses, delegates to the domain module, responds |
| DB domain (with `--with-db`) | `src/db/{domain}/index.ts` | Exported queries + types | Table defs, query builders, pagination |
| Component | `src/<feature>/` once a second page needs it | Props | Markup, local logic |

## Testing Corollary

Test at the module boundary, not internals:
- Domain modules: test the exported functions (`src/health/index.test.ts`)
- Endpoints: `src/pages/**` is excluded from test discovery, so keep them thin and test the module beneath
- DB: test exported query functions
- If you must test an internal → the module should split
