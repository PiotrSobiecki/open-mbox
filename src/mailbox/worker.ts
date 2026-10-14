/**
 * The thread that owns the open mailbox. The file is streamed straight from disk into
 * the parser, and opening a message reads its bytes from the same File again; nothing
 * here touches the network, which is what keeps the archive on the visitor's machine.
 * Opening a second file abandons the first mid-read.
 */

import { createMailbox, type Mailbox, type MailboxSource } from "./index";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { MailboxStatus } from "./types";

const STATUS_INTERVAL_MS = 250;
const EMPTY_PAGE = { total: 0, items: [] };

let mailbox: Mailbox | null = null;
let generation = 0;

function post(response: WorkerResponse, transfer: Transferable[] = []): void {
	self.postMessage(response, { transfer });
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	switch (request.type) {
		case "open":
			void open(request.file);
			return;
		case "search":
			post({
				type: "search",
				requestId: request.requestId,
				page: mailbox?.search(request.query) ?? EMPTY_PAGE,
			});
			return;
		case "get":
			void get(request.requestId, request.messageId);
			return;
		case "attachment":
			void attachment(request.requestId, request.messageId, request.index);
	}
});

async function get(requestId: number, messageId: number): Promise<void> {
	try {
		const message = (await mailbox?.get(messageId)) ?? null;
		post({ type: "get", requestId, message, error: null });
	} catch (error) {
		post({ type: "get", requestId, message: null, error: describeError(error) });
	}
}

async function attachment(requestId: number, messageId: number, index: number): Promise<void> {
	try {
		const file = (await mailbox?.attachment(messageId, index)) ?? null;
		post({ type: "attachment", requestId, file, error: null }, file ? [file.content] : []);
	} catch (error) {
		post({ type: "attachment", requestId, file: null, error: describeError(error) });
	}
}

function fileSource(file: File): MailboxSource {
	return {
		read: async (offset, length) =>
			new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
	};
}

async function open(file: File): Promise<void> {
	const current = ++generation;
	const box = createMailbox(fileSource(file));
	mailbox = box;

	let bytesRead = 0;
	let reportedAt = 0;
	const report = (phase: MailboxStatus["phase"], error: string | null = null) => {
		if (current !== generation) return;
		reportedAt = Date.now();
		const status: MailboxStatus = {
			phase,
			fileName: file.name,
			fileSize: file.size,
			bytesRead,
			messageCount: box.size,
			error,
		};
		post({ type: "status", status });
	};

	report("parsing");
	try {
		const reader = file.stream().getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (current !== generation) {
				await reader.cancel();
				return;
			}
			if (done) break;
			await box.append(value);
			bytesRead += value.byteLength;
			if (Date.now() - reportedAt >= STATUS_INTERVAL_MS) report("parsing");
		}
		await box.finish();
		bytesRead = file.size;
		report("ready");
	} catch (error) {
		report("error", describeError(error));
	}
}
