/**
 * Cuts an mbox byte stream into raw messages at every line that starts with "From ".
 *
 * It works on bytes, not text: each message declares its own charset, and decoding the
 * whole archive as UTF-8 up front would mangle ISO-8859-2 or Windows-1250 bodies before
 * the MIME parser ever saw their headers. Chunks may end anywhere, mid-line included.
 */

const FROM_LINE = new TextEncoder().encode("From ");
const LF = 0x0a;
const EMPTY = new Uint8Array(0);

export class MboxSplitter {
	#parts: Uint8Array[] = [];
	#started = false;
	#atLineStart = true;
	#carry: Uint8Array = EMPTY;

	/** Feeds the next chunk; returns the messages it completed. */
	push(chunk: Uint8Array): Uint8Array[] {
		return this.#scan(concat([this.#carry, chunk]), false);
	}

	/** Flushes the last message. Input without any "From " line is one message (.eml). */
	end(): Uint8Array[] {
		const done = this.#scan(this.#carry, true);
		const last = concat(this.#parts);
		this.#parts = [];
		if (this.#started || hasContent(last)) done.push(last);
		return done.filter(hasContent);
	}

	#scan(buf: Uint8Array, final: boolean): Uint8Array[] {
		const done: Uint8Array[] = [];
		this.#carry = EMPTY;
		let segment = 0;
		let i = 0;

		while (i < buf.length) {
			if (this.#atLineStart) {
				// Too few bytes to tell whether this line opens a message: wait for more.
				if (!final && isPartialFrom(buf, i)) {
					this.#parts.push(buf.subarray(segment, i));
					this.#carry = buf.slice(i);
					return done;
				}
				if (startsWithFrom(buf, i)) {
					this.#closeMessage(buf.subarray(segment, i), done);
					segment = i;
				}
			}
			const newline = buf.indexOf(LF, i);
			this.#atLineStart = newline !== -1;
			if (newline === -1) break;
			i = newline + 1;
		}

		this.#parts.push(buf.subarray(segment));
		return done;
	}

	/** A "From " line ends whatever came before it; bytes before the first are a preamble. */
	#closeMessage(tail: Uint8Array, done: Uint8Array[]): void {
		this.#parts.push(tail);
		const previous = concat(this.#parts);
		if (this.#started && hasContent(previous)) done.push(previous);
		this.#parts = [];
		this.#started = true;
	}
}

function isPartialFrom(buf: Uint8Array, at: number): boolean {
	return buf.length - at < FROM_LINE.length && isFromPrefix(buf, at);
}

function startsWithFrom(buf: Uint8Array, at: number): boolean {
	if (buf.length - at < FROM_LINE.length) return false;
	return FROM_LINE.every((byte, k) => buf[at + k] === byte);
}

function isFromPrefix(buf: Uint8Array, at: number): boolean {
	for (let k = 0; at + k < buf.length; k++) {
		if (buf[at + k] !== FROM_LINE[k]) return false;
	}
	return true;
}

function hasContent(bytes: Uint8Array): boolean {
	return bytes.some((byte) => byte !== 0x20 && byte !== 0x09 && byte !== 0x0d && byte !== LF);
}

function concat(parts: Uint8Array[]): Uint8Array {
	const nonEmpty = parts.filter((part) => part.length > 0);
	if (nonEmpty.length === 1 && nonEmpty[0]) return nonEmpty[0];
	const out = new Uint8Array(nonEmpty.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of nonEmpty) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}
