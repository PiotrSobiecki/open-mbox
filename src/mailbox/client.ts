/**
 * The UI side of the mailbox worker: requests become promises, status pushes become
 * listener calls. The worker bundle is the only one that carries the MIME parser.
 */

import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { AttachmentFile, MailboxStatus, MailMessage, SearchPage, SearchQuery } from "./types";

/** Reading a message goes back to the file, which may have moved since it was opened. */
export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MailboxClient {
	open(file: File): void;
	search(query: SearchQuery): Promise<SearchPage>;
	get(messageId: number): Promise<Loaded<MailMessage>>;
	attachment(messageId: number, index: number): Promise<Loaded<AttachmentFile>>;
	subscribe(listener: (status: MailboxStatus) => void): () => void;
}

const NOT_FOUND = "Nie znaleziono wiadomości w archiwum";

export function createMailboxClient(): MailboxClient {
	const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
	const listeners = new Set<(status: MailboxStatus) => void>();
	const pending = new Map<number, (response: WorkerResponse) => void>();
	let nextRequestId = 0;
	let last: MailboxStatus | null = null;

	const notify = (status: MailboxStatus) => {
		last = status;
		for (const listener of listeners) listener(status);
	};

	worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
		const response = event.data;
		if (response.type === "status") {
			notify(response.status);
			return;
		}
		pending.get(response.requestId)?.(response);
		pending.delete(response.requestId);
	});

	worker.addEventListener("error", (event) => {
		notify({
			phase: "error",
			fileName: last?.fileName ?? "",
			fileSize: last?.fileSize ?? 0,
			bytesRead: last?.bytesRead ?? 0,
			messageCount: last?.messageCount ?? 0,
			error: event.message || "Parser przestał działać",
		});
	});

	const request = (build: (requestId: number) => WorkerRequest): Promise<WorkerResponse> =>
		new Promise((resolve) => {
			const requestId = nextRequestId++;
			pending.set(requestId, resolve);
			worker.postMessage(build(requestId));
		});

	const loaded = <T>(value: T | null, error: string | null): Loaded<T> =>
		value ? { ok: true, value } : { ok: false, error: error ?? NOT_FOUND };

	return {
		open(file) {
			worker.postMessage({ type: "open", file } satisfies WorkerRequest);
		},
		async search(query) {
			const response = await request((requestId) => ({ type: "search", requestId, query }));
			return response.type === "search" ? response.page : { total: 0, items: [] };
		},
		async get(messageId) {
			const response = await request((requestId) => ({ type: "get", requestId, messageId }));
			return response.type === "get"
				? loaded(response.message, response.error)
				: loaded<MailMessage>(null, null);
		},
		async attachment(messageId, index) {
			const response = await request((requestId) => ({
				type: "attachment",
				requestId,
				messageId,
				index,
			}));
			return response.type === "attachment"
				? loaded(response.file, response.error)
				: loaded<AttachmentFile>(null, null);
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
