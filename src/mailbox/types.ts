export type SearchField = "all" | "subject" | "from" | "body";

export interface MailMessage {
	id: number;
	from: string;
	fromEmail: string;
	to: string;
	subject: string;
	date: string;
	dateTs: number;
	text: string;
	html: string | null;
	labels: string[];
}

export type MailSummary = Omit<MailMessage, "html" | "text"> & { preview: string };

export interface SearchQuery {
	text: string;
	field: SearchField;
	offset: number;
	limit: number;
}

export interface SearchPage {
	total: number;
	items: MailSummary[];
}

export interface MailboxStatus {
	phase: "idle" | "parsing" | "ready" | "error";
	fileName: string;
	fileSize: number;
	bytesRead: number;
	messageCount: number;
	error: string | null;
}
