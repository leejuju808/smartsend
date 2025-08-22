"use client";
import { useRef, useState } from "react";

export default function ContactsImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [addingTag, setAddingTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [fileName, setFileName] = useState("");

  async function importCsv() {
    const f = fileRef.current?.files?.[0];
    if (!f) return alert("Pick a CSV file");
    setBusy(true); setRes(null);
    const fd = new FormData();
    fd.append("file", f);
    if (addingTag.trim()) fd.append("addTag", addingTag.trim());
    const r = await fetch("/api/contacts/import", { method: "POST", body: fd });
    const j = await r.json();
    setRes(j); setBusy(false);
  }

  function downloadRejects() {
    if (!res?.rejectsBase64) return;
    const href = `data:text/csv;base64,${res.rejectsBase64}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = res.rejectsFilename || "rejected.csv";
    a.click();
  }

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="text-sm font-medium">Import contacts (CSV)</div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="block w-full rounded-xl border p-2"
        onChange={e => setFileName(e.target.files?.[0]?.name || "")}
      />
      {fileName && <div className="text-xs text-gray-600">Selected: {fileName}</div>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="text-xs text-gray-600">Add tag to all (optional)</label>
          <input
            value={addingTag}
            onChange={e => setAddingTag(e.target.value)}
            placeholder="lead, trial, imported-2025-08"
            className="mt-1 w-full rounded-xl border p-2"
          />
        </div>
        <button disabled={busy} onClick={importCsv} className="self-end rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {res && (
        <div className="rounded-xl border p-4 text-sm">
          <div className="font-medium">Import summary</div>
          <ul className="mt-2 space-y-1">
            <li>Inserted: <b>{res.inserted}</b></li>
            <li>Skipped (dupes/existing): <b>{res.skipped}</b></li>
            <li>Suppressed: <b>{res.suppressed}</b></li>
            <li>Invalid emails: <b>{res.invalid}</b></li>
            <li>Total in file: <b>{res.total_in_file}</b></li>
          </ul>
          {res.rejectsBase64 && (
            <button onClick={downloadRejects} className="mt-3 rounded-xl border px-3 py-1.5 text-xs">
              Download rejected.csv
            </button>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import { useRef, useState } from "react";

export default function ContactsImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [addingTag, setAddingTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [fileName, setFileName] = useState("");

  async function importCsv() {
    const f = fileRef.current?.files?.[0];
    if (!f) return alert("Pick a CSV file");
    setBusy(true); setRes(null);
    const fd = new FormData();
    fd.append("file", f);
    if (addingTag.trim()) fd.append("addTag", addingTag.trim());
    const r = await fetch("/api/contacts/import", { method: "POST", body: fd });
    const j = await r.json();
    setRes(j); setBusy(false);
  }

  function downloadRejects() {
    if (!res?.rejectsBase64) return;
    const href = `data:text/csv;base64,${res.rejectsBase64}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = res.rejectsFilename || "rejected.csv";
    a.click();
  }

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="text-sm font-medium">Import contacts (CSV)</div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="block w-full rounded-xl border p-2"
        onChange={e => setFileName(e.target.files?.[0]?.name || "")}
      />
      {fileName && <div className="text-xs text-gray-600">Selected: {fileName}</div>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="text-xs text-gray-600">Add tag to all (optional)</label>
          <input
            value={addingTag}
            onChange={e => setAddingTag(e.target.value)}
            placeholder="lead, trial, imported-2025-08"
            className="mt-1 w-full rounded-xl border p-2"
          />
        </div>
        <button disabled={busy} onClick={importCsv} className="self-end rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {res && (
        <div className="rounded-xl border p-4 text-sm">
          <div className="font-medium">Import summary</div>
          <ul className="mt-2 space-y-1">
            <li>Inserted: <b>{res.inserted}</b></li>
            <li>Skipped (dupes/existing): <b>{res.skipped}</b></li>
            <li>Suppressed: <b>{res.suppressed}</b></li>
            <li>Invalid emails: <b>{res.invalid}</b></li>
            <li>Total in file: <b>{res.total_in_file}</b></li>
          </ul>
          {res.rejectsBase64 && (
            <button onClick={downloadRejects} className="mt-3 rounded-xl border px-3 py-1.5 text-xs">
              Download rejected.csv
            </button>
          )}
        </div>
      )}
    </div>
  );
}

