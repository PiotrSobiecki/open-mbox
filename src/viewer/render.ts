const DATE_FORMAT = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" });

export function formatDate(date: string, timestamp: number): string {
	return timestamp ? DATE_FORMAT.format(new Date(timestamp)) : date || "—";
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * The policy every e-mail body renders under, carried inside the document itself on top
 * of the iframe sandbox. No scripts and no network: a remote image is how a sender
 * learns that, when and from where a message was opened. Inline styles stay, because
 * that is how mail is styled. Prepended rather than inserted into <head>, so markup in
 * the message — a commented-out <head>, say — cannot push it out of effect.
 */
const EMAIL_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

export function toSafeSrcDoc(html: string): string {
	return `<meta http-equiv="Content-Security-Policy" content="${EMAIL_CSP}">${html}`;
}
