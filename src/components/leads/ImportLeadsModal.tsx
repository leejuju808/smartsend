"use client";

import { useState } from "react";
import { downloadStringAsFile } from "@/lib/download";

export default function ImportLeadsModal({ campaignId, onClose }: { campaignId?: string | null; onClose: () => void; }) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<null | { inserted: number; failed: number; total: number; errorCsv?: string }>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImport() {
    if (!file) return setError("Choose a CSV file first.");
    setIsLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);
    if (campaignId) form.append("campaignId", campaignId);

    const res = await fetch("/api/leads/import", { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) {
      setIsLoading(false);
      return setError(data?.error ?? "Import failed");
    }

    setResult(data);
    setIsLoading(false);
  }

  return (
    <div className="p-6 w-[520px] max-w-full bg-white rounded-2xl shadow-xl">
      <h2 className="text-xl font-semibold mb-3">Import Leads (CSV)</h2>
      <p className="text-sm text-gray-600 mb-4">Headers accepted: <code>email</code>, <code>name</code>, <code>company</code>. Case-insensitive.</p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mb-4"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={onImport}
          disabled={isLoading || !file}
          className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
        >
          {isLoading ? "Importing…" : "Import"}
        </button>
        <button onClick={onClose} className="px-3 py-2 rounded-xl border">Close</button>
      </div>

      {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}

      {result && (
        <div className="mt-5 rounded-lg border p-4 bg-gray-50">
          <div className="font-medium">Result</div>
          <div className="text-sm text-gray-700 mt-1">Inserted: <b>{result.inserted}</b> / Total: <b>{result.total}</b> / Failed: <b className={result.failed ? "text-red-600" : "text-green-600"}>{result.failed}</b></div>

          {!!result.errorCsv && (
            <button
              className="mt-3 px-3 py-2 rounded-xl bg-white border shadow-sm"
              onClick={() => downloadStringAsFile(result.errorCsv!, `import_errors_${Date.now()}.csv`)}
            >
              Download error rows (CSV)
            </button>
          )}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        Tip: Include one intentionally bad email to quickly see the error CSV flow.
      </div>
    </div>
  );
}
