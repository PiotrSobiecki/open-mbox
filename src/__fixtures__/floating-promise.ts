// Fixture: deliberately floats a Promise so Biome's noFloatingPromises rule fires.
// Linted with a per-path override in biome.json so the only failure surface is that rule.

export function dropPromise(): void {
	fetch("https://example.com");
}
