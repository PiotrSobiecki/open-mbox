import "./attachments.css";
import { useState } from "react";
import type { AttachmentFile, AttachmentInfo } from "@/mailbox";
import type { Loaded } from "@/mailbox/client";
import { Paperclip } from "./paperclip";
import { blobType, formatBytes, viewableType } from "./render";

interface AttachmentsProps {
	attachments: AttachmentInfo[];
	load: (index: number) => Promise<Loaded<AttachmentFile>>;
}

/** Blob URLs outlive the click so a PDF viewer can still save or reload the file. */
const URL_LIFETIME_MS = 10 * 60_000;

/**
 * One chip per attachment. The main button opens formats the browser can show in a new
 * tab and downloads the rest; the arrow beside an openable file always downloads it.
 */
export function Attachments({ attachments, load }: AttachmentsProps) {
	const [busy, setBusy] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	if (attachments.length === 0) return null;

	const fetchFile = async (attachment: AttachmentInfo): Promise<AttachmentFile | null> => {
		setBusy(attachment.index);
		setError(null);
		try {
			const result = await load(attachment.index);
			if (result.ok) return result.value;
			setError(`Nie udało się wczytać „${attachment.filename}”: ${result.error}`);
			return null;
		} finally {
			setBusy(null);
		}
	};

	const save = async (attachment: AttachmentInfo) => {
		const file = await fetchFile(attachment);
		if (file) saveFile(file);
	};

	const open = async (
		attachment: AttachmentInfo,
		type: NonNullable<ReturnType<typeof viewableType>>,
	) => {
		// The tab has to open inside the click: after awaiting the worker, popup blockers
		// (Safari and Firefox above all) no longer count it as user-initiated.
		const tab = window.open("", "_blank");
		if (!tab) {
			setError("Przeglądarka zablokowała nowe okno. Zezwól na wyskakujące okna albo pobierz plik.");
			return;
		}
		tab.opener = null;
		tab.document.title = `Otwieranie: ${attachment.filename}`;
		const file = await fetchFile(attachment);
		if (!file) {
			tab.close();
			return;
		}
		const url = URL.createObjectURL(
			new Blob([file.content], { type: blobType(type, file.content) }),
		);
		tab.location.replace(url);
		setTimeout(() => URL.revokeObjectURL(url), URL_LIFETIME_MS);
	};

	return (
		<>
			<ul className="attachments" aria-label="Załączniki">
				{attachments.map((attachment) => {
					const type = viewableType(attachment.mimeType, attachment.filename);
					return (
						<li key={attachment.index} className="attachment">
							<button
								type="button"
								className="attachment-main"
								title={
									type
										? `Otwórz ${attachment.filename} w nowej karcie`
										: `Pobierz ${attachment.filename}`
								}
								disabled={busy === attachment.index}
								onClick={() => void (type ? open(attachment, type) : save(attachment))}
							>
								<Paperclip />
								<span className="attachment-name">{attachment.filename}</span>
								<span className="attachment-size">{formatBytes(attachment.size)}</span>
							</button>
							{type && (
								<button
									type="button"
									className="attachment-download"
									title="Pobierz na dysk"
									aria-label={`Pobierz ${attachment.filename}`}
									disabled={busy === attachment.index}
									onClick={() => void save(attachment)}
								>
									<DownloadArrow />
								</button>
							)}
						</li>
					);
				})}
			</ul>
			{error && (
				<p className="attachment-error" role="alert">
					{error}
				</p>
			)}
		</>
	);
}

function DownloadArrow() {
	return (
		<svg
			aria-hidden="true"
			className="paperclip"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M12 4v12M6 11l6 6 6-6M5 20h14" />
		</svg>
	);
}

/** Hands the bytes to the browser's download flow; nothing is opened or rendered. */
function saveFile(file: AttachmentFile): void {
	const url = URL.createObjectURL(new Blob([file.content], { type: "application/octet-stream" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = file.filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), URL_LIFETIME_MS);
}
