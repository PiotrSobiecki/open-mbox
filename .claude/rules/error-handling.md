# Error Handling

## Layered Approach

| Layer | Pattern | Location |
|-------|---------|----------|
| Domain module | Return `Result<T>` for recoverable failures; define a typed error class per domain (`HealthInputError` in `src/health/index.ts` is the example) | `src/<domain>/` |
| Endpoint | Map a failed result to an explicit status with `Response.json({ error }, { status })` | `src/pages/api/` |
| DB (with `--with-db`) | Drizzle wraps pg errors in `DrizzleQueryError` | `src/db/` |

Unexpected errors propagate to Astro's default error handler.

## Drizzle Error Unwrapping

`error.cause` holds original Postgres error, NOT `error.message`.
`error.message` = `"Failed query: <SQL>\nparams: <values>"` — never contains constraint info.
Check `error.cause.code` for pg codes (e.g. `23505` = unique violation).

## Response Consistency

```ts
// Success
return Response.json({ data: entity }, { status: 200 })

// Error
return Response.json({ error: "Not found" }, { status: 404 })
return Response.json({ error: "Validation failed", details: errors }, { status: 400 })
```
