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

/**
 * Every <meta> tag in the message, quoted attribute values included. Neither the sandbox
 * nor the policy stops a document from navigating itself, and `<meta http-equiv="refresh">`
 * does exactly that, so a message carrying one would still report its opening to a remote
 * host. No <meta> the message brings has a job here: the body is already decoded, and the
 * policy is the one prepended below.
 */
const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

export function toSafeSrcDoc(html: string): string {
	const policy = `<meta http-equiv="Content-Security-Policy" content="${EMAIL_CSP}">`;
	return `${policy}${html.replace(META_TAG, "")}`;
}

/**
 * Formats a browser shows without running anything, keyed by MIME type and by file
 * extension (mail often labels a PDF application/octet-stream). An attachment opened in a
 * tab is a blob: URL on this site's origin, so the type it is served as is chosen from
 * this list, never taken from the message: HTML declared as image/png still opens as an
 * image. HTML, SVG and everything unlisted are downloaded instead.
 */
const VIEWABLE_TYPES = [
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
	"image/bmp",
	"text/plain",
	"audio/mpeg",
	"audio/mp4",
	"audio/wav",
	"audio/ogg",
	"video/mp4",
	"video/webm",
	"video/ogg",
] as const;

type ViewableType = (typeof VIEWABLE_TYPES)[number];

/** Declared types that are safe to show as one of the viewable types. */
const VIEWABLE_ALIASES: Record<string, ViewableType> = {
	"image/jpg": "image/jpeg",
	"image/pjpeg": "image/jpeg",
	"text/csv": "text/plain",
	"application/json": "text/plain",
	"text/calendar": "text/plain",
	"text/vcard": "text/plain",
	"text/x-vcard": "text/plain",
	"audio/mp3": "audio/mpeg",
	"audio/x-wav": "audio/wav",
	"audio/wave": "audio/wav",
};

const VIEWABLE_EXTENSIONS: Record<string, ViewableType> = {
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	bmp: "image/bmp",
	txt: "text/plain",
	csv: "text/plain",
	log: "text/plain",
	md: "text/plain",
	json: "text/plain",
	ics: "text/plain",
	vcf: "text/plain",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	wav: "audio/wav",
	ogg: "audio/ogg",
	opus: "audio/ogg",
	mp4: "video/mp4",
	webm: "video/webm",
	ogv: "video/ogg",
};

/** The type to open an attachment as in a new tab, or null when it should be downloaded. */
export function viewableType(mimeType: string, filename: string): ViewableType | null {
	const declared = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
	const byType = VIEWABLE_TYPES.find((type) => type === declared) ?? VIEWABLE_ALIASES[declared];
	if (byType) return byType;
	const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	return extension ? (VIEWABLE_EXTENSIONS[extension] ?? null) : null;
}

/**
 * The Content-Type a viewable attachment is served with. Text gets a charset only when its
 * bytes are valid UTF-8; otherwise the browser's own default decides, which beats
 * forcing UTF-8 onto a Windows-1250 file.
 */
export function blobType(type: ViewableType, content: ArrayBuffer): string {
	if (type !== "text/plain") return type;
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(content);
		return "text/plain;charset=utf-8";
	} catch {
		return "text/plain";
	}
}
