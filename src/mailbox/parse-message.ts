import PostalMime, { type Address, decodeWords } from "postal-mime";
import type { MailMessage } from "./types";

const TEXT_LIMIT = 50_000;
const HTML_LIMIT = 200_000;
const NO_SENDER = "(brak nadawcy)";
const NO_SUBJECT = "(bez tematu)";

export async function parseMessage(raw: Uint8Array, id: number): Promise<MailMessage> {
	const message = withoutFromLine(raw);
	try {
		const email = await PostalMime.parse(message);
		const from = formatAddress(email.from);
		const html = email.html ? email.html.slice(0, HTML_LIMIT) : null;
		const text = (email.text?.trim() || (html ? stripHtml(html) : "")).slice(0, TEXT_LIMIT);
		const date = email.date ?? "";
		return {
			id,
			from: from.display,
			fromEmail: from.email,
			to: (email.to ?? []).map((address) => formatAddress(address).display).join(", "),
			subject: email.subject?.trim() || NO_SUBJECT,
			date,
			dateTs: toTimestamp(date),
			text,
			html,
			labels: parseLabels(email.headers.find((h) => h.key === "x-gmail-labels")?.value),
		};
	} catch {
		return fallbackMessage(message, id);
	}
}

/** The mbox separator line belongs to the archive, not to the message. */
function withoutFromLine(raw: Uint8Array): Uint8Array {
	const startsWithFrom = new TextDecoder().decode(raw.subarray(0, 5)) === "From ";
	if (!startsWithFrom) return raw;
	const newline = raw.indexOf(0x0a);
	return newline === -1 ? new Uint8Array(0) : raw.subarray(newline + 1);
}

function formatAddress(address: Address | undefined): { display: string; email: string } {
	if (!address) return { display: NO_SENDER, email: "" };
	if (address.group) {
		const emails = address.group.map((member) => member.address).filter(Boolean);
		const names = address.group.map((member) => member.name || member.address).filter(Boolean);
		return { display: names.join(", ") || address.name || NO_SENDER, email: emails.join(", ") };
	}
	const name = address.name.trim();
	const email = address.address.trim();
	if (name && email) return { display: `${name} <${email}>`, email };
	return { display: name || email || NO_SENDER, email };
}

function parseLabels(header: string | undefined): string[] {
	if (!header) return [];
	return decodeWords(header)
		.split(",")
		.map((label) => label.trim())
		.filter(Boolean);
}

function toTimestamp(date: string): number {
	return date ? Date.parse(date) || 0 : 0;
}

function stripHtml(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&amp;/gi, "&")
		.replace(/\s+/g, " ")
		.trim();
}

/** A message the MIME parser rejects still gets listed, with whatever headers can be read. */
function fallbackMessage(message: Uint8Array, id: number): MailMessage {
	const source = new TextDecoder().decode(message);
	const header = (name: string) =>
		source.match(new RegExp(`^${name}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
	const date = header("Date");
	return {
		id,
		from: header("From") || NO_SENDER,
		fromEmail: "",
		to: header("To"),
		subject: header("Subject") || NO_SUBJECT,
		date,
		dateTs: toTimestamp(date),
		text: source.slice(0, 2000),
		html: null,
		labels: parseLabels(header("X-Gmail-Labels")),
	};
}
