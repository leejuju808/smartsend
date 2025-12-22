"use client";

import * as React from "react";

type PreviewRow = Record<string, string>;

export default function ImportLeadsDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<PreviewRow[]>([]);
  const [mapping, setMapping] = React.useState<{ email?: string; first_name?: string; last_name?: string; company?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<null | {
    inserted: number;
    skipped_duplicates: number;
    file_duplicates: number;
    errors: number;
    errorCsvBase64?: string | null;
  }>(null);

  function readHeadersAndPreview(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const [firstLine, ...rest] = text.split(/\r?\n/);
      if (!firstLine) return;
      const cols = firstLine.split(",").map((s) => s.replace(/(^"|"$)/g, "").trim());
      setHeaders(cols);

      const previewRows: PreviewRow[] = [];
      for (let i = 0; i < Math.min(5, rest.length); i++) {
        const line = rest[i];
        if (!line?.trim()) continue;
        const cells: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const ch of line) {
          if (ch === '"' && inQuotes) {
            inQuotes = false;
          } else if (ch === '"' && !inQuotes) {
            inQuotes = true;
          } else if (ch === "," && !inQuotes) {
            cells.push(current);
            current = "";
          } else {
            current += ch;
          }
        }
        cells.push(current);
        const row: PreviewRow = {};
        cols.forEach((h, idx) => (row[h] = (cells[idx] || "").replace(/(^"|"$)/g, "")));
        previewRows.push(row);
      }
      setPreview(previewRows);

      const lower = cols.map((c) => c.toLowerCase());
      const pick = (names: string[]) => {
        for (const n of names) {
          const i = lower.indexOf(n);
          if (i >= 0) return cols[i];
        }
        return undefined;
      };
      setMapping((m) => ({
        email: m.email ?? pick(["email", "e-mail"]),
        first_name: m.first_name ?? pick(["first_name", "firstname", "first"]),
        last_name: m.last_name ?? pick(["last_name", "lastname", "last"]),
        company: m.company ?? pick(["company", "company_name", "org", "organization"]),
      }));
    };
    reader.readAsText(f);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
    if (f) readHeadersAndPreview(f);
  }

  async function onSubmit() {
    if (!file) return;
    if (!mapping.email) {
      alert("Please map the Email column.");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));

      const res = await fetch(`/api/leads/import?campaignId=${encodeURIComponent(campaignId)}`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.errorCsvBase64) downloadErrorCsv(json.errorCsvBase64);
        throw new Error(json?.error || "Import failed");
      }
      setResult(json);
    } catch (e: any) {
      alert(e?.message || "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadErrorCsv(base64: string) {
    const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <button className="rounded-2xl px-4 py-2 border shadow-sm" onClick={() => setOpen(true)}>
        Import Leads (CSV)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-2xl w-full bg-white rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Import Leads</h2>
              <button onClick={() => setOpen(false)} className="px-2 py-1 rounded border">Close</button>
            </div>

            <div className="grid gap-2">
              <label className="text-sm">CSV File</label>
              <input type="file" accept=".csv,text/csv" onChange={onFileChange} />
              <p className="text-xs opacity-60">Max ~10k rows recommended. First row must be headers.</p>
            </div>

            {!!headers.length && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm">Email *</label>
                  <select
                    className="border rounded-lg px-2 py-1"
                    value={mapping.email || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, email: e.target.value }))}
                  >
                    <option value="" disabled>
                      Pick column
                    </option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">First name</label>
                  <select
                    className="border rounded-lg px-2 py-1"
                    value={mapping.first_name || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, first_name: e.target.value || undefined }))}
                  >
                    <option value="">(none)</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Last name</label>
                  <select
                    className="border rounded-lg px-2 py-1"
                    value={mapping.last_name || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, last_name: e.target.value || undefined }))}
                  >
                    <option value="">(none)</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Company</label>
                  <select
                    className="border rounded-lg px-2 py-1"
                    value={mapping.company || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, company: e.target.value || undefined }))}
                  >
                    <option value="">(none)</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {!!preview.length && (
              <div className="border rounded-lg p-3">
                <div className="text-sm font-medium mb-2">Preview (first 5 rows)</div>
                <div className="overflow-auto max-h-48">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 bg-gray-100">
                        {headers.map((h) => (
                          <th key={h} className="text-left p-1">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, idx) => (
                        <tr key={idx} className="border-t">
                          {headers.map((h) => (
                            <td key={h} className="p-1">
                              {r[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                className="rounded-2xl px-4 py-2 border shadow-sm disabled:opacity-60"
                onClick={onSubmit}
                disabled={!file || !mapping.email || submitting}
              >
                {submitting ? "Importing..." : "Start Import"}
              </button>
              {result?.errors ? (
                <button
                  className="rounded-2xl px-4 py-2 border"
                  onClick={() => result?.errorCsvBase64 && downloadErrorCsv(result.errorCsvBase64!)}
                >
                  Download Error CSV
                </button>
              ) : null}
            </div>

            {result && (
              <div className="text-sm bg-gray-50 rounded p-3">
                <div>
                  <b>Inserted:</b> {result.inserted}
                </div>
                <div>
                  <b>Skipped (already in campaign):</b> {result.skipped_duplicates}
                </div>
                <div>
                  <b>Duplicates in file:</b> {result.file_duplicates}
                </div>
                <div>
                  <b>Errors:</b> {result.errors}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


