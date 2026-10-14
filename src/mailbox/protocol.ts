import type { MailboxStatus, MailMessage, SearchPage, SearchQuery } from "./types";

export type WorkerRequest =
	| { type: "open"; file: File }
	| { type: "search"; requestId: number; query: SearchQuery }
	| { type: "get"; requestId: number; messageId: number };

export type WorkerResponse =
	| { type: "status"; status: MailboxStatus }
	| { type: "search"; requestId: number; page: SearchPage }
	| { type: "get"; requestId: number; message: MailMessage | null };
