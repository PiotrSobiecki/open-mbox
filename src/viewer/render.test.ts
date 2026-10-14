import { formatBytes, formatDate, toSafeSrcDoc } from "./render";

describe("formatBytes", () => {
	it.each([
		[512, "512 B"],
		[2048, "2.0 KB"],
		[5 * 1024 ** 2, "5.0 MB"],
		[3 * 1024 ** 3, "3.00 GB"],
	])("formats %i bytes as %s", (bytes, expected) => {
		expect(formatBytes(bytes)).toBe(expected);
	});
});

describe("formatDate", () => {
	it("formats a parsed timestamp", () => {
		expect(formatDate("ignored", Date.UTC(2024, 5, 15, 12))).toContain("2024");
	});

	it("falls back to the raw header when the date could not be parsed", () => {
		expect(formatDate("wczoraj", 0)).toBe("wczoraj");
	});

	it("shows a dash when there is no date at all", () => {
		expect(formatDate("", 0)).toBe("—");
	});
});

describe("toSafeSrcDoc", () => {
	const doc = toSafeSrcDoc('<!-- <head> --><img src="https://tracker.example/pixel.gif">');

	it("puts the policy ahead of any message markup", () => {
		expect(doc.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
	});

	it("blocks every network fetch and script", () => {
		const policy = doc.match(/content="([^"]+)"/)?.[1] ?? "";
		expect(policy).toContain("default-src 'none'");
		expect(policy).not.toMatch(/https?:|\*|script-src/);
	});

	it("leaves the message markup untouched", () => {
		expect(doc.endsWith('<img src="https://tracker.example/pixel.gif">')).toBe(true);
	});
});
