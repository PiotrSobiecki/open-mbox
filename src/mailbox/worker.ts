/**
 * The thread that owns the open mailbox. The file is streamed straight from disk into
 * the parser; nothing here touches the network, which is what keeps the archive on the
 * visitor's machine. Opening a second file abandons the first mid-read.
 */

import { createMailbox, type Mailbox } from "./index";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { MailboxStatus } from "./types";

const STATUS_INTERVAL_MS = 250;

let mailbox: Mailbox = createMailbox();
let generation = 0;

function post(response: WorkerResponse): void {
	self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	switch (request.type) {
		case "open":
			void open(request.file);
			return;
		case "search":
			post({ type: "search", requestId: request.requestId, page: mailbox.search(request.query) });
			return;
		case "get":
			post({
				type: "get",
				requestId: request.requestId,
				message: mailbox.get(request.messageId) ?? null,
			});
	}
});

async function open(file: File): Promise<void> {
	const current = ++generation;
	const box = createMailbox();
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
		report("error", error instanceof Error ? error.message : String(error));
	}
}
