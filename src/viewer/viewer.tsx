import "@fontsource-variable/dm-sans";
import "@fontsource/jetbrains-mono/400.css";
import "./viewer.css";
import { useDeferredValue, useEffect, useState } from "react";
import type { MailboxStatus, MailMessage, MailSummary, SearchField } from "@/mailbox";
import { createMailboxClient } from "@/mailbox/client";
import { MessageDetail } from "./message-detail";
import { MessageList } from "./message-list";
import { Opener } from "./opener";
import { formatBytes } from "./render";

const PAGE_SIZE = 80;

const IDLE: MailboxStatus = {
	phase: "idle",
	fileName: "",
	fileSize: 0,
	bytesRead: 0,
	messageCount: 0,
	error: null,
};

export default function Viewer() {
	const [client] = useState(createMailboxClient);
	const [status, setStatus] = useState(IDLE);
	const [items, setItems] = useState<MailSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [query, setQuery] = useState("");
	const [field, setField] = useState<SearchField>("all");
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [selected, setSelected] = useState<MailMessage | null>(null);
	const [loadingMore, setLoadingMore] = useState(false);
	const [showOpener, setShowOpener] = useState(false);
	const deferredQuery = useDeferredValue(query);
	const { phase, messageCount } = status;

	useEffect(() => client.subscribe(setStatus), [client]);

	// Re-run on every progress tick too, so the list fills in while the file is read.
	useEffect(() => {
		if (phase !== "parsing" && phase !== "ready") return;
		if (messageCount === 0 && phase === "parsing") return;
		let cancelled = false;
		const load = async () => {
			const page = await client.search({
				text: deferredQuery,
				field,
				offset: 0,
				limit: PAGE_SIZE,
			});
			if (cancelled) return;
			setItems(page.items);
			setTotal(page.total);
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [client, phase, messageCount, deferredQuery, field]);

	useEffect(() => {
		if (selectedId === null) {
			setSelected(null);
			return;
		}
		let cancelled = false;
		const load = async () => {
			const message = await client.get(selectedId);
			if (!cancelled) setSelected(message);
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [client, selectedId]);

	const closeMessage = () => {
		setSelectedId(null);
		setSelected(null);
	};

	const openFile = (file: File) => {
		closeMessage();
		setItems([]);
		setTotal(0);
		setQuery("");
		setShowOpener(false);
		client.open(file);
	};

	const loadMore = async () => {
		if (loadingMore || items.length >= total) return;
		setLoadingMore(true);
		try {
			const page = await client.search({
				text: deferredQuery,
				field,
				offset: items.length,
				limit: PAGE_SIZE,
			});
			setItems((previous) => previous.concat(page.items));
			setTotal(page.total);
		} finally {
			setLoadingMore(false);
		}
	};

	const percent =
		status.fileSize > 0 ? Math.min(100, Math.round((status.bytesRead / status.fileSize) * 100)) : 0;

	if (phase === "idle" || (phase === "error" && messageCount === 0)) {
		return (
			<div className="landing">
				<h1>Open MBOX</h1>
				<p className="tagline">
					Podgląd archiwum poczty .mbox w przeglądarce. Bez instalacji, bez konta, bez wysyłania
					plików.
				</p>
				<Opener onFile={openFile} error={status.error} />
			</div>
		);
	}

	if (phase === "parsing" && messageCount === 0) {
		return (
			<div className="progress-screen">
				<h2>Wczytywanie archiwum…</h2>
				<ProgressBar percent={percent} />
				<p className="progress-meta">
					{percent}% · {formatBytes(status.bytesRead)} / {formatBytes(status.fileSize)}
					<br />
					{status.fileName}
				</p>
			</div>
		);
	}

	return (
		<>
			{showOpener && (
				<div className="opener-overlay" role="dialog" aria-label="Otwórz archiwum">
					<div className="opener-panel">
						<h2>Otwórz archiwum</h2>
						<Opener onFile={openFile} error={null} />
						<button type="button" className="btn-ghost" onClick={() => setShowOpener(false)}>
							Anuluj
						</button>
					</div>
				</div>
			)}
			<div className={`app-shell${selected ? " detail-open" : ""}`}>
				<aside className="sidebar">
					<div className="toolbar">
						<div className="toolbar-top">
							<span className="brand">Open MBOX</span>
							<button type="button" className="btn-ghost" onClick={() => setShowOpener(true)}>
								Otwórz plik…
							</button>
						</div>
						<div className="file-meta" title={status.fileName}>
							{status.fileName} · {formatBytes(status.fileSize)}
							{phase === "parsing" && ` · ${percent}%`}
						</div>
						<div className="search-row">
							<input
								className="search-input"
								type="search"
								placeholder="Szukaj…"
								aria-label="Szukaj"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
							<select
								className="field-select"
								value={field}
								onChange={(event) => setField(event.target.value as SearchField)}
								aria-label="Pole wyszukiwania"
							>
								<option value="all">Wszystko</option>
								<option value="subject">Temat</option>
								<option value="from">Nadawca</option>
								<option value="body">Treść</option>
							</select>
						</div>
						<div className="stats">
							{total === messageCount
								? `${messageCount} wiadomości`
								: `${total} z ${messageCount} wiadomości`}
							{phase === "parsing" && " (wczytywanie…)"}
							{phase === "error" && ` · błąd: ${status.error}`}
						</div>
					</div>
					{phase === "parsing" && <ProgressBar percent={percent} thin />}
					<MessageList
						items={items}
						total={total}
						messageCount={messageCount}
						selectedId={selectedId}
						loadingMore={loadingMore}
						onSelect={setSelectedId}
						onLoadMore={() => void loadMore()}
					/>
				</aside>
				<main className="detail">
					{selected ? (
						<MessageDetail key={selected.id} message={selected} onBack={closeMessage} />
					) : (
						<div className="detail-empty">Wybierz wiadomość z listy, żeby zobaczyć treść</div>
					)}
				</main>
			</div>
		</>
	);
}

function ProgressBar({ percent, thin = false }: { percent: number; thin?: boolean }) {
	return (
		<div
			className={`progress-bar${thin ? " thin" : ""}`}
			role="progressbar"
			aria-valuenow={percent}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<span style={{ width: `${percent}%` }} />
		</div>
	);
}
