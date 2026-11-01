import { blobType, formatBytes, formatDate, toSafeSrcDoc, viewableType } from "./render";

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

	it("drops a meta refresh, which would navigate the frame to a remote host", () => {
		const refreshing = toSafeSrcDoc(
			'<meta http-equiv="refresh" content="0; url=https://tracker.example/open?id=1"><p>Hej</p>',
		);
		expect(refreshing).not.toContain("refresh");
		expect(refreshing.endsWith("<p>Hej</p>")).toBe(true);
	});

	it("drops a meta tag however its attributes are quoted", () => {
		const tricky = toSafeSrcDoc(
			`<META content='0;url=https://tracker.example/a>b' HTTP-EQUIV=Refresh><p>Hej</p>`,
		);
		expect(tricky).not.toMatch(/tracker\.example/);
		expect(tricky.endsWith("<p>Hej</p>")).toBe(true);
	});
});

describe("viewableType", () => {
	it.each([
		["application/pdf", "umowa.pdf", "application/pdf"],
		["application/octet-stream", "Umowa.PDF", "application/pdf"],
		["image/jpg", "zdjecie", "image/jpeg"],
		["text/csv; charset=windows-1250", "dane.csv", "text/plain"],
		["application/json", "eksport", "text/plain"],
		["video/mp4", "film.mp4", "video/mp4"],
	])("opens %s named %s as %s", (mimeType, filename, expected) => {
		expect(viewableType(mimeType, filename)).toBe(expected);
	});

	it.each([
		["text/html", "strona.html"],
		["image/svg+xml", "logo.svg"],
		["application/octet-stream", "strona.htm"],
		["application/zip", "archiwum.zip"],
		["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "pismo.docx"],
		["application/octet-stream", "bez-rozszerzenia"],
	])("downloads %s named %s instead of opening it", (mimeType, filename) => {
		expect(viewableType(mimeType, filename)).toBeNull();
	});

	it("trusts a safe declared type over a risky extension", () => {
		// Shown as an image, the bytes cannot run as a page whatever the name claims.
		expect(viewableType("image/png", "zaproszenie.html")).toBe("image/png");
	});
});

describe("blobType", () => {
	const bytes = (values: number[]) => new Uint8Array(values).buffer;

	it("declares UTF-8 for text that is valid UTF-8", () => {
		expect(blobType("text/plain", new TextEncoder().encode("Zażółć").buffer)).toBe(
			"text/plain;charset=utf-8",
		);
	});

	it("leaves the charset to the browser for text in another encoding", () => {
		// "Zażółć" in Windows-1250 is not valid UTF-8.
		expect(blobType("text/plain", bytes([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6]))).toBe("text/plain");
	});

	it("passes every other type through", () => {
		expect(blobType("application/pdf", bytes([0x25, 0x50]))).toBe("application/pdf");
	});
});
