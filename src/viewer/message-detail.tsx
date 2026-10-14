import { useState } from "react";
import type { MailMessage } from "@/mailbox";
import { formatDate, toSafeSrcDoc } from "./render";

interface MessageDetailProps {
	message: MailMessage;
	onBack: () => void;
}

/** Remount per message (`key`), so the HTML/text choice starts fresh each time. */
export function MessageDetail({ message, onBack }: MessageDetailProps) {
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
