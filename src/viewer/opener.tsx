import "./opener.css";
import { useState } from "react";

interface OpenerProps {
	onFile: (file: File) => void;
	error: string | null;
}

export function Opener({ onFile, error }: OpenerProps) {
	const [dragging, setDragging] = useState(false);

	return (
		<section
			aria-label="Otwórz plik mbox"
			className={`dropzone${dragging ? " active" : ""}`}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragging(false);
				const file = event.dataTransfer.files[0];
				if (file) onFile(file);
			}}
		>
			<div className="icon" aria-hidden="true">
				✉
			</div>
			<p>{error ?? "Przeciągnij plik .mbox tutaj albo wybierz go z dysku"}</p>
			<label className="btn-primary">
				Wybierz plik .mbox
				<input
					type="file"
					accept=".mbox,.eml,.txt,application/mbox,message/rfc822"
					hidden
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) onFile(file);
						event.target.value = "";
					}}
				/>
			</label>
			<p className="hint">Plik nie opuszcza tego komputera — czyta go Twoja przeglądarka.</p>
		</section>
	);
}
