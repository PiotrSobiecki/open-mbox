export type RenameTarget =
	| { file: string; mode: "package-name" }
	| { file: string; mode: "all-occurrences"; needle: string };
export type RenameResult = "renamed" | "skipped" | "missing";
export type FanoutResult = "copied" | "skipped" | "no-template";
