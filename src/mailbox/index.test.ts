import { createMailbox, type Mailbox } from "./index";

const encoder = new TextEncoder();

interface Draft {
	from?: string;
	subject: string;
	date?: string;
	body?: string;
	headers?: string[];
}

function message({
	from = "Anna <anna@example.com>",
	subject,
	date,
	body = "Treść",
	headers = [],
}: Draft) {
	return [
		"From MAILER-DAEMON Mon Jan  1 00:00:00 2024",
		`From: ${from}`,
		"To: Jan <jan@example.com>",
		`Subject: ${subject}`,
		...(date ? [`Date: ${date}`] : []),
		...headers,
		"",
		body,
		"",
	].join("\n");
}

async function load(bytes: Uint8Array, chunkSize = bytes.length): Promise<Mailbox> {
	const mailbox = createMailbox();
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		await mailbox.append(bytes.subarray(offset, offset + chunkSize));
	}
	await mailbox.finish();
	return mailbox;
}

const ALL = { text: "", field: "all", offset: 0, limit: 100 } as const;

function subjects(mailbox: Mailbox): string[] {
	return mailbox.search(ALL).items.map((item) => item.subject);
}

const ARCHIVE_SOURCE = [
	message({ subject: "Pierwsza", date: "Mon, 1 Jan 2024 10:00:00 +0000" }),
	message({
		from: "Bank <powiadomienia@bank.example>",
		subject: "Faktura za styczeń",
		date: "Thu, 1 Feb 2024 10:00:00 +0000",
		body: "Kwota do zapłaty.\n>From lines escaped by the archiver stay in the message.",
	}),
	message({
		subject: "Trzecia",
		date: "Fri, 1 Mar 2024 10:00:00 +0000",
		body: "Spotkanie w czwartek",
		headers: ["X-Gmail-Labels: Inbox,Important,=?UTF-8?Q?Wa=C5=BCne?="],
	}),
].join("");
const ARCHIVE = encoder.encode(ARCHIVE_SOURCE);

describe("createMailbox", () => {
	it("splits an archive at every line that starts with From", async () => {
		const mailbox = await load(ARCHIVE);
		expect(mailbox.size).toBe(3);
	});

	it.each([1, 2, 5, 7, 64, 1024])(
		"finds the same messages when the file arrives in %i-byte chunks",
		async (chunkSize) => {
			expect(subjects(await load(ARCHIVE, chunkSize))).toEqual(subjects(await load(ARCHIVE)));
		},
	);

	it("does not split at From that is only text inside a line", async () => {
		const mailbox = await load(encoder.encode(message({ subject: "A", body: "Reply From here" })));
		expect(mailbox.size).toBe(1);
	});

	it("reads CRLF archives", async () => {
		const mailbox = await load(encoder.encode(ARCHIVE_SOURCE.replace(/\n/g, "\r\n")));
		expect(subjects(mailbox)).toEqual(["Trzecia", "Faktura za styczeń", "Pierwsza"]);
	});

	it("drops a preamble before the first From line", async () => {
		const mailbox = await load(encoder.encode(`junk before\n${message({ subject: "Jedyna" })}`));
		expect(subjects(mailbox)).toEqual(["Jedyna"]);
	});

	it("treats input without any From line as one message, as in an .eml file", async () => {
		const eml = encoder.encode("From: anna@example.com\nSubject: Pojedyncza\n\nTreść\n");
		expect(subjects(await load(eml))).toEqual(["Pojedyncza"]);
	});

	it("decodes each message in the charset it declares", async () => {
		const head = encoder.encode(
			[
				"From x",
				"Subject: Latin-2",
				"Content-Type: text/plain; charset=iso-8859-2",
				"Content-Transfer-Encoding: 8bit",
				"",
				"",
			].join("\n"),
		);
		// "Zażółć" in ISO-8859-2: only valid as text once the declared charset is applied.
		const body = new Uint8Array([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6, 0x0a]);
		const mailbox = await load(new Uint8Array([...head, ...body]));
		expect(mailbox.get(0)?.text).toBe("Zażółć");
	});

	it("reads Gmail labels, decoding encoded words", async () => {
		const mailbox = await load(ARCHIVE);
		const labelled = mailbox.search({ ...ALL, text: "Trzecia", field: "subject" }).items[0];
		expect(labelled?.labels).toEqual(["Inbox", "Important", "Ważne"]);
	});

	it("derives plain text from HTML when a message has no text part", async () => {
		const html = message({
			subject: "HTML",
			headers: ["Content-Type: text/html; charset=utf-8"],
			body: "<html><style>p{color:red}</style><p>Cześć &amp; witaj</p></html>",
		});
		const mailbox = await load(encoder.encode(html));
		expect(mailbox.get(0)?.text).toBe("Cześć & witaj");
		expect(mailbox.get(0)?.html).toContain("<p>Cześć &amp; witaj</p>");
	});

	it("fills in placeholders for missing sender and subject", async () => {
		const mailbox = await load(encoder.encode("From x\n\nbody only\n"));
		expect(mailbox.get(0)).toMatchObject({ from: "(brak nadawcy)", subject: "(bez tematu)" });
	});
});

describe("Mailbox.search", () => {
	it("lists newest first", async () => {
		expect(subjects(await load(ARCHIVE))).toEqual(["Trzecia", "Faktura za styczeń", "Pierwsza"]);
	});

	it.each([
		["subject", "faktura", ["Faktura za styczeń"]],
		["from", "POWIADOMIENIA@", ["Faktura za styczeń"]],
		["body", "spotkanie", ["Trzecia"]],
		["all", "bank", ["Faktura za styczeń"]],
		["subject", "spotkanie", []],
	] as const)("matches %s against %s, ignoring case", async (field, text, expected) => {
		const mailbox = await load(ARCHIVE);
		const found = mailbox.search({ ...ALL, field, text }).items.map((item) => item.subject);
		expect(found).toEqual(expected);
	});

	it("pages with offset and limit while reporting the full total", async () => {
		const page = (await load(ARCHIVE)).search({ ...ALL, offset: 1, limit: 1 });
		expect(page.total).toBe(3);
		expect(page.items.map((item) => item.subject)).toEqual(["Faktura za styczeń"]);
	});

	it("returns summaries with a preview instead of the body", async () => {
		const [summary] = (await load(ARCHIVE)).search(ALL).items;
		expect(summary).not.toHaveProperty("html");
		expect(summary).not.toHaveProperty("text");
		expect(summary?.preview).toBe("Spotkanie w czwartek");
	});
});

describe("Mailbox.get", () => {
	it("returns undefined for an id it never issued", async () => {
		expect((await load(ARCHIVE)).get(99)).toBeUndefined();
	});
});
