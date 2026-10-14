export type SearchField = "all" | "subject" | "from" | "body";

export interface AttachmentInfo {
	/** Position among the message's MIME attachments; the key for downloading it. */
	index: number;
	filename: string;
	mimeType: string;
	size: number;
	/** Shown inside the HTML body through a cid: reference rather than listed. */
	inline: boolean;
}

export interface AttachmentFile {
	filename: string;
	mimeType: string;
	content: ArrayBuffer;
}

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
	attachments: AttachmentInfo[];
}

export type MailSummary = Omit<MailMessage, "html" | "text" | "attachments"> & {
	preview: string;
	/** Attachments a reader would download; inline images are not counted. */
	attachmentCount: number;
};

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
