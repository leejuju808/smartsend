// /app/contacts/import/page.tsx
"use client";

import { useState } from "react";

type PreviewRow = Record<string, string>;

const KNOWN_FIELDS = ["email", "first_name", "last_name", "company", "title", "phone", "notes"] as const;
type KnownField = typeof KNOWN_FIELDS[number];

export default function ImportContactsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [mapping, setMapping] = useState<Record<KnownField, string>>({
    email: "",
    first_name: "",
    last_name: "",
    company: "",
    title: "",
    phone: "",
    notes: "",
  });
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [resultMsg, setResultMsg] = useState<string>("");

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("phase", "preview");
    const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Upload failed");
      return;
    }
    setHeaders(json.headers || []);
    setPreview(json.preview || []);
    // naive auto-map by header name
    const initial: Record<KnownField, string> = { ...mapping };
    for (const h of json.headers as string[]) {
      const lh = h.toLowerCase().trim();
      if (lh === "email" || lh === "e-mail") initial.email = h;
      if (lh === "first_name" || lh === "first name" || lh === "firstname" || lh === "given" || lh === "fname") initial.first_name = h;
      if (lh === "last_name" || lh === "last name" || lh === "lastname" || lh === "surname" || lh === "lname") initial.last_name = h;
      if (lh === "company" || lh === "organization" || lh === "org") initial.company = h;
      if (lh === "title" || lh === "job title" || lh === "role") initial.title = h;
      if (lh === "phone" || lh === "phone number" || lh === "mobile") initial.phone = h;
      if (lh === "notes" || lh === "note") initial.notes = h;
    }
    setMapping(initial);
    setStep("map");
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!mapping.email) {
      alert("Map an Email column before importing.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("phase", "import");
    fd.append("mapping", JSON.stringify(mapping));
    const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Import failed");
      return;
    }
    setResultMsg(
      `Imported: ${json.stats.inserted} new, ${json.stats.updated} updated, ` +
      `${json.stats.skipped_duplicates} duplicates skipped, ${json.stats.skipped_suppressed} suppressed skipped.`
    );
    setStep("result");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Import Contacts</h1>
      </div>

      {step === "upload" && (
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="rounded-2xl border p-6 bg-background">
            <label className="block text-sm font-medium mb-2">Upload CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full"
            />
            <p className="text-xs text-muted-foreground mt-2">
              CSV should include at least an <strong>Email</strong> column.
            </p>
          </div>
          <button
            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            disabled={!file}
          >
            Continue
          </button>
        </form>
      )}

      {step === "map" && (
        <form onSubmit={handleImport} className="space-y-6">
          <div className="rounded-2xl border p-6 bg-background">
            <h2 className="text-lg font-semibold mb-4">Map Columns</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {KNOWN_FIELDS.map((f) => (
                <div key={f} className="flex flex-col gap-1">
                  <label className="text-sm font-medium capitalize">{f.replace("_", " ")}</label>
                  <select
                    className="px-3 py-2 border rounded-xl bg-background"
                    value={mapping[f]}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f]: e.target.value }))
                    }
                  >
                    <option value="">— Not Mapped —</option>
                    {headers.map((h) => (
                      <option value={h} key={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="font-medium mb-2">Preview (first 20 rows)</h3>
              <div className="overflow-auto border rounded-xl">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left p-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t">
                        {headers.map((h) => (
                          <td key={h} className="p-2">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Any emails found on your <strong>suppression list</strong> will be skipped automatically.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="px-4 py-2 rounded-xl border"
            >
              Back
            </button>
            <button className="px-4 py-2 rounded-xl bg-black text-white">
              Import
            </button>
          </div>
        </form>
      )}

      {step === "result" && (
        <div className="rounded-2xl border p-6 bg-background space-y-3">
          <div className="text-lg font-semibold">Import Complete</div>
          <div>{resultMsg}</div>
          <div className="flex gap-2">
            <a href="/contacts/import" className="px-4 py-2 rounded-xl border">Import Another</a>
            <a href="/meetings" className="px-4 py-2 rounded-xl bg-black text-white">Go to Meetings</a>
          </div>
        </div>
      )}
    </div>
  );
}
