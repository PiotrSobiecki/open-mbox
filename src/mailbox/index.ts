/**
 * An mbox archive, indexed in memory: bytes go in as they are read, searchable messages
 * come out. Only what search and the list need stays in memory — headers, a capped body
 * text, attachment names. Opening a message or an attachment reads that message's bytes
 * again from the source, so a multi-gigabyte archive costs its index, not its size.
 */

import { MboxSplitter, type RawMessage } from "./mbox-splitter";
import { inlineImages, parseMessage } from "./parse-message";
import type {
	AttachmentFile,
	MailMessage,
	MailSummary,
	SearchField,
	SearchPage,
	SearchQuery,
} from "./types";

export type {
	AttachmentFile,
	AttachmentInfo,
	MailboxStatus,
	MailMessage,
	MailSummary,
	SearchField,
} from "./types";

export interface MailboxSource {
	/** `length` bytes of the archive starting at `offset`. */
	read(offset: number, length: number): Promise<Uint8Array>;
}

export interface Mailbox {
	/** Indexes every message the chunk completes. Chunks may split lines anywhere. */
	append(chunk: Uint8Array): Promise<void>;
	/** Indexes the last message; call once, after the final chunk. */
	finish(): Promise<void>;
	readonly size: number;
	/** Newest first. Matching is case-insensitive substring search. */
	search(query: SearchQuery): SearchPage;
	/** The whole message, read again from the source, with inline images resolved. */
	get(id: number): Promise<MailMessage | undefined>;
	/** One attachment's bytes, read again from the source. */
	attachment(id: number, index: number): Promise<AttachmentFile | undefined>;
}

type IndexedMessage = Omit<MailMessage, "html"> & { offset: number; length: number };

const INDEX_TEXT_LIMIT = 50_000;
const DETAIL_TEXT_LIMIT = 1_000_000;
const PREVIEW_LENGTH = 160;

export function createMailbox(source: MailboxSource): Mailbox {
	const splitter = new MboxSplitter();
	const messages: IndexedMessage[] = [];
	const byId = new Map<number, IndexedMessage>();
	let sorted = true;
	let nextId = 0;

	const add = async (raws: RawMessage[]): Promise<void> => {
		for (const raw of raws) {
			const { html: _html, parts: _parts, text, ...fields } = await parseMessage(raw.bytes);
			const message: IndexedMessage = {
				...fields,
				id: nextId++,
				text: text.slice(0, INDEX_TEXT_LIMIT),
				offset: raw.offset,
				length: raw.bytes.length,
			};
			messages.push(message);
			byId.set(message.id, message);
			sorted = false;
		}
	};

	const reread = async (id: number, contentAs: "arraybuffer" | "base64") => {
		const entry = byId.get(id);
		if (!entry) return undefined;
		return parseMessage(await source.read(entry.offset, entry.length), contentAs);
	};

	return {
		append: (chunk) => add(splitter.push(chunk)),
		finish: () => add(splitter.end()),
		get size() {
			return messages.length;
		},
		search({ text, field, offset, limit }) {
			if (!sorted) {
				messages.sort((a, b) => b.dateTs - a.dateTs || a.id - b.id);
				sorted = true;
			}
			const needle = text.trim().toLowerCase();
			const hits = needle ? messages.filter((m) => matches(m, needle, field)) : messages;
			return { total: hits.length, items: hits.slice(offset, offset + limit).map(toSummary) };
		},
		async get(id) {
			const parsed = await reread(id, "base64");
			if (!parsed) return undefined;
			const { parts, html, text, ...fields } = parsed;
			return {
				...fields,
				id,
				text: text.slice(0, DETAIL_TEXT_LIMIT),
				html: html && inlineImages(html, parts),
			};
		},
		async attachment(id, index) {
			const parsed = await reread(id, "arraybuffer");
			const info = parsed?.attachments[index];
			const part = parsed?.parts[index];
			if (!info || !part) return undefined;
			return {
				filename: info.filename,
				mimeType: info.mimeType,
				content: toArrayBuffer(part.content),
			};
		},
	};
}

function matches(message: IndexedMessage, needle: string, field: SearchField): boolean {
	const inSubject = () => message.subject.toLowerCase().includes(needle);
	const inFrom = () => `${message.from} ${message.fromEmail}`.toLowerCase().includes(needle);
	const inBody = () => message.text.toLowerCase().includes(needle);
	const inAttachments = () =>
		message.attachments.some((a) => a.filename.toLowerCase().includes(needle));
	switch (field) {
		case "subject":
			return inSubject();
		case "from":
			return inFrom();
		case "body":
			return inBody();
		case "all":
			return inSubject() || inFrom() || inBody() || inAttachments();
	}
}

function toSummary({
	text,
	attachments,
	offset: _offset,
	length: _length,
	...rest
}: IndexedMessage): MailSummary {
	return {
		...rest,
		preview: text.slice(0, PREVIEW_LENGTH),
		attachmentCount: attachments.filter((a) => !a.inline).length,
	};
}

function toArrayBuffer(content: ArrayBuffer | Uint8Array | string): ArrayBuffer {
	if (content instanceof ArrayBuffer) return content;
	const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
