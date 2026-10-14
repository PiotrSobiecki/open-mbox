import type { MailSummary } from "@/mailbox";
import { Paperclip } from "./paperclip";
import { formatDate } from "./render";

interface MessageListProps {
	items: MailSummary[];
	total: number;
	messageCount: number;
	selectedId: number | null;
	loadingMore: boolean;
	onSelect: (id: number) => void;
	onLoadMore: () => void;
}

export function MessageList({
	items,
	total,
	messageCount,
	selectedId,
	loadingMore,
	onSelect,
	onLoadMore,
}: MessageListProps) {
	if (items.length === 0) {
		return (
			<div className="message-list">
				<div className="empty-list">
					{messageCount === 0 ? "Brak wiadomości" : "Brak wyników dla tego zapytania"}
				</div>
			</div>
		);
	}

	return (
		<ul className="message-list" aria-label="Wiadomości">
			{items.map((message) => (
				<li key={message.id}>
					<button
						type="button"
						aria-current={selectedId === message.id}
						className={`msg-item${selectedId === message.id ? " selected" : ""}`}
						onClick={() => onSelect(message.id)}
					>
						<div className="msg-from">{message.from}</div>
						<div className="msg-subject">{message.subject}</div>
						<div className="msg-meta">
							<span>{formatDate(message.date, message.dateTs)}</span>
							{message.attachmentCount > 0 && (
								<span className="msg-attachments" title="Załączniki">
									<Paperclip />
									{message.attachmentCount}
								</span>
							)}
						</div>
						{message.preview && <div className="msg-preview">{message.preview}</div>}
					</button>
				</li>
			))}
			{items.length < total && (
				<li>
					<button
						type="button"
						className="btn-ghost load-more"
						onClick={onLoadMore}
						disabled={loadingMore}
					>
						{loadingMore ? "Ładowanie…" : `Załaduj więcej (${items.length}/${total})`}
					</button>
				</li>
			)}
		</ul>
	);
}
