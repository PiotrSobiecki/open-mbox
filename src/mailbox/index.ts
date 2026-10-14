/**
 * An mbox archive held in memory: bytes go in as they are read, searchable messages
 * come out. Splitting, MIME parsing and ordering stay behind this interface, so the
 * Web Worker that owns a mailbox only moves bytes and messages across the thread line.
 */

import { MboxSplitter } from "./mbox-splitter";
import { parseMessage } from "./parse-message";
import type { MailMessage, MailSummary, SearchField, SearchPage, SearchQuery } from "./types";

export type { MailboxStatus, MailMessage, MailSummary, SearchField } from "./types";

export interface Mailbox {
	/** Parses every message the chunk completes. Chunks may split lines anywhere. */
	append(chunk: Uint8Array): Promise<void>;
	/** Parses the last message; call once, after the final chunk. */
	finish(): Promise<void>;
	readonly size: number;
	/** Newest first. Matching is case-insensitive substring search. */
	search(query: SearchQuery): SearchPage;
	get(id: number): MailMessage | undefined;
}

const PREVIEW_LENGTH = 160;

export function createMailbox(): Mailbox {
	const splitter = new MboxSplitter();
	const messages: MailMessage[] = [];
	const byId = new Map<number, MailMessage>();
	let sorted = true;
	let nextId = 0;

	const add = async (raws: Uint8Array[]): Promise<void> => {
		for (const raw of raws) {
			const message = await parseMessage(raw, nextId++);
			messages.push(message);
			byId.set(message.id, message);
			sorted = false;
		}
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
		get: (id) => byId.get(id),
	};
}

function matches(message: MailMessage, needle: string, field: SearchField): boolean {
	const inSubject = () => message.subject.toLowerCase().includes(needle);
	const inFrom = () => `${message.from} ${message.fromEmail}`.toLowerCase().includes(needle);
	const inBody = () => message.text.toLowerCase().includes(needle);
	switch (field) {
		case "subject":
			return inSubject();
		case "from":
			return inFrom();
		case "body":
			return inBody();
		case "all":
			return inSubject() || inFrom() || inBody();
	}
}

function toSummary({ html: _html, text, ...rest }: MailMessage): MailSummary {
	return { ...rest, preview: text.slice(0, PREVIEW_LENGTH) };
}
