# Tailwind CSS v4

## Setup in this template

- Plugin: `@tailwindcss/vite` registered in `astro.config.mjs` under `vite.plugins`.
- Entry CSS: `src/styles/globals.css` contains `@import "tailwindcss";` — import this once from a top-level layout.
- **No `tailwind.config.{js,ts}` file.** v4 reads theme tokens directly from CSS via `@theme`.

## Customizing the theme

Add tokens inside `src/styles/globals.css`:

```css
@import "tailwindcss";

@theme {
	--color-brand: oklch(0.72 0.15 250);
	--font-sans: "Inter", system-ui, sans-serif;
	--breakpoint-3xl: 120rem;
}
```

Tokens become utility classes automatically (`bg-brand`, `text-brand`, `font-sans`, `3xl:` variant).

## Custom utilities

Use `@utility` in CSS (not `@layer utilities`):

```css
@utility content-auto {
	content-visibility: auto;
}
```

## Variants & states

- Dark mode: configure via `@variant dark (...)` in CSS. Default is `prefers-color-scheme`.
- Group / peer / data variants work as in v3 — no config change needed.

## Don't

- Don't use the v3 plugin API (`tailwind.config.js`) — v4 ignores it.
- Don't `@apply` shadcn-specific patterns this template doesn't ship — start from raw utilities.
- Don't import `tailwindcss/base` etc. separately — a single `@import "tailwindcss";` covers preflight + utilities.
