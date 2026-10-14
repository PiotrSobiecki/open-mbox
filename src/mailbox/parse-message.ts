import PostalMime, { type Address, type Attachment, decodeWords } from "postal-mime";
import type { AttachmentInfo } from "./types";

const NO_SENDER = "(brak nadawcy)";
const NO_SUBJECT = "(bez tematu)";
const CID_REFERENCE = /cid:([^"'\s)>]+)/gi;
const IMAGE_TYPE = /^image\/[\w.+-]+$/i;

/** Everything one parse of a message yields; the mailbox decides what to keep. */
export interface ParsedMessage {
	from: string;
	fromEmail: string;
	to: string;
	subject: string;
	date: string;
	dateTs: number;
	labels: string[];
	text: string;
	html: string | null;
	attachments: AttachmentInfo[];
	/** The MIME attachments themselves, content included, in `AttachmentInfo.index` order. */
	parts: Attachment[];
}

export async function parseMessage(
	raw: Uint8Array,
	contentAs: "arraybuffer" | "base64" = "arraybuffer",
): Promise<ParsedMessage> {
	const message = withoutFromLine(raw);
	try {
		const email = await PostalMime.parse(message, { attachmentEncoding: contentAs });
		const from = formatAddress(email.from);
		const html = email.html ?? null;
		const referenced = new Set(
			[...(html ?? "").matchAll(CID_REFERENCE)].map((m) => normalizeId(m[1])),
		);
		const date = email.date ?? "";
		return {
			from: from.display,
			fromEmail: from.email,
			to: (email.to ?? []).map((address) => formatAddress(address).display).join(", "),
			subject: email.subject?.trim() || NO_SUBJECT,
			date,
			dateTs: toTimestamp(date),
			labels: parseLabels(email.headers.find((h) => h.key === "x-gmail-labels")?.value),
			text: email.text?.trim() || (html ? stripHtml(html) : ""),
			html,
			attachments: email.attachments.map((part, index) => describe(part, index, referenced)),
			parts: email.attachments,
		};
	} catch {
		return fallbackMessage(message);
	}
}

/**
 * Swaps cid: references for data: URLs of the inline images they name, so a message
 * shows its embedded pictures without the iframe fetching anything. Needs parts parsed
 * with `contentAs: "base64"`.
 */
export function inlineImages(html: string, parts: Attachment[]): string {
	const images = new Map<string, Attachment>();
	for (const part of parts) {
		const id = normalizeId(part.contentId);
		if (id && IMAGE_TYPE.test(part.mimeType) && typeof part.content === "string") {
			images.set(id, part);
		}
	}
	if (images.size === 0) return html;
	return html.replace(CID_REFERENCE, (reference, id: string) => {
		const part = images.get(normalizeId(id));
		return part ? `data:${part.mimeType};base64,${part.content}` : reference;
	});
}

function describe(part: Attachment, index: number, referenced: Set<string>): AttachmentInfo {
	const id = normalizeId(part.contentId);
	const mimeType = part.mimeType || "application/octet-stream";
	return {
		index,
		filename:
			part.filename?.trim() ||
			`załącznik-${index + 1}${mimeType === "message/rfc822" ? ".eml" : ""}`,
		mimeType,
		size: byteSize(part.content),
		inline: id !== "" && referenced.has(id),
	};
}

/** Content-IDs arrive as `<id@host>`, references as `cid:id@host`, sometimes URL-encoded. */
function normalizeId(id: string | undefined): string {
	if (!id) return "";
	const bare = id.trim().replace(/^<|>$/g, "");
	try {
		return decodeURIComponent(bare).toLowerCase();
	} catch {
		return bare.toLowerCase();
	}
}

function byteSize(content: Attachment["content"]): number {
	if (typeof content !== "string") return content.byteLength;
	const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
	return Math.max(0, Math.floor((content.length * 3) / 4) - padding);
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
function fallbackMessage(message: Uint8Array): ParsedMessage {
	const source = new TextDecoder().decode(message);
	const header = (name: string) =>
		source.match(new RegExp(`^${name}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
	const date = header("Date");
	return {
		from: header("From") || NO_SENDER,
		fromEmail: "",
		to: header("To"),
		subject: header("Subject") || NO_SUBJECT,
		date,
		dateTs: toTimestamp(date),
		labels: parseLabels(header("X-Gmail-Labels")),
		text: source.slice(0, 2000),
		html: null,
		attachments: [],
		parts: [],
	};
}
