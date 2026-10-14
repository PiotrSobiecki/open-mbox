import { useState } from "react";
import type { AttachmentFile, AttachmentInfo, MailMessage } from "@/mailbox";
import type { Loaded } from "@/mailbox/client";
import { Paperclip } from "./paperclip";
import { formatBytes, formatDate, toSafeSrcDoc } from "./render";

interface MessageDetailProps {
	message: MailMessage;
	onBack: () => void;
	loadAttachment: (index: number) => Promise<Loaded<AttachmentFile>>;
}

/** Remount per message (`key`), so the HTML/text choice starts fresh each time. */
export function MessageDetail({ message, onBack, loadAttachment }: MessageDetailProps) {
	const [mode, setMode] = useState<"html" | "text">(message.html ? "html" : "text");

	return (
		<>
			<header className="detail-header">
				<button type="button" className="back" onClick={onBack}>
					← Lista
				</button>
				<h2 className="detail-subject">{message.subject}</h2>
				<dl className="detail-fields">
					<dt>Od</dt>
					<dd>{message.from}</dd>
					{message.to && (
						<>
							<dt>Do</dt>
							<dd>{message.to}</dd>
						</>
					)}
					<dt>Data</dt>
					<dd>{formatDate(message.date, message.dateTs)}</dd>
				</dl>
				{message.labels.length > 0 && (
					<div className="detail-labels">
						{message.labels.map((label) => (
							<span key={label} className="chip">
								{label}
							</span>
						))}
					</div>
				)}
				<Attachments
					attachments={message.attachments.filter((a) => !a.inline)}
					load={loadAttachment}
				/>
			</header>
			<div className="detail-body">
				{message.html && (
					<div className="view-toggle">
						<button
							type="button"
							className={mode === "html" ? "active" : ""}
							onClick={() => setMode("html")}
						>
							HTML
						</button>
						<button
							type="button"
							className={mode === "text" ? "active" : ""}
							onClick={() => setMode("text")}
						>
							Tekst
						</button>
					</div>
				)}
				{mode === "html" && message.html ? (
					// An empty sandbox: no scripts, forms, popups or same-origin access.
					<iframe title="Treść wiadomości" sandbox="" srcDoc={toSafeSrcDoc(message.html)} />
				) : (
					<pre>{message.text || "(brak treści tekstowej)"}</pre>
				)}
			</div>
		</>
	);
}

interface AttachmentsProps {
	attachments: AttachmentInfo[];
	load: (index: number) => Promise<Loaded<AttachmentFile>>;
}

function Attachments({ attachments, load }: AttachmentsProps) {
	const [busy, setBusy] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	if (attachments.length === 0) return null;

	const download = async (attachment: AttachmentInfo) => {
		setBusy(attachment.index);
		setError(null);
		try {
			const result = await load(attachment.index);
			if (result.ok) saveFile(result.value);
			else setError(`Nie udało się pobrać „${attachment.filename}”: ${result.error}`);
		} finally {
			setBusy(null);
		}
	};

	return (
		<>
			<ul className="attachments" aria-label="Załączniki">
				{attachments.map((attachment) => (
					<li key={attachment.index}>
						<button
							type="button"
							className="attachment"
							title={`Pobierz ${attachment.filename}`}
							disabled={busy === attachment.index}
							onClick={() => void download(attachment)}
						>
							<Paperclip />
							<span className="attachment-name">{attachment.filename}</span>
							<span className="attachment-size">{formatBytes(attachment.size)}</span>
						</button>
					</li>
				))}
			</ul>
			{error && (
				<p className="attachment-error" role="alert">
					{error}
				</p>
			)}
		</>
	);
}

/** Hands the bytes to the browser's download flow; nothing is opened or rendered. */
function saveFile(file: AttachmentFile): void {
	const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
	const link = document.createElement("a");
	link.href = url;
	link.download = file.filename;
	link.click();
	// The download starts asynchronously; revoking the URL at once can cancel it.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
