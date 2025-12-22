"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LeadImportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const campaignId = params.id;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setStatus(null);
    setError(null);

    if (f) {
      const text = await f.text();
      const lines = text.split(/\r?\n/).slice(0, 5);
      setPreview(lines);
    }
  }

  async function importLeads() {
    if (!file) return;

    setLoading(true);
    setStatus(null);
    setError(null);

    const form = new FormData();
    form.append("campaign_id", campaignId);
    form.append("file", file);

    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Import failed");
        setLoading(false);
        return;
      }

      setStatus(`Imported ${data.imported} leads. ${data.ignored} ignored.`);
      setLoading(false);

      setTimeout(() => {
        router.push(`/campaigns/${campaignId}`);
      }, 1500);
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/campaigns/${campaignId}`}
          className="text-xs text-neutral-400 hover:text-neutral-300 mb-2"
        >
          ← Back to campaign
        </Link>
        <h1 className="text-xl font-semibold text-neutral-50">
          Import Leads
        </h1>
        <p className="text-sm text-neutral-400">
          Upload a CSV of homeowners to add them to this campaign.
        </p>
      </header>

      <div className="max-w-xl space-y-6 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5 text-sm text-neutral-100">
        {/* File upload */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-300">CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="rounded-xl border border-neutral-700 bg-neutral-900/70 px-3 py-2 text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-100 file:text-neutral-900 hover:file:bg-neutral-200 cursor-pointer"
          />
          <p className="text-xs text-neutral-500">
            We'll auto-detect columns like Email, Name, Address, Phone, City, State, Zip
          </p>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-neutral-400">Preview:</div>
            <pre className="max-h-32 overflow-auto rounded-xl bg-neutral-900 p-3 text-[0.7rem] text-neutral-300">
              {preview.slice(0, 5).join("\n")}
            </pre>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* Status */}
        {status && (
          <div className="rounded-xl border border-green-800 bg-green-950/50 p-3 text-xs text-green-200">
            {status}
          </div>
        )}

        {/* Import button */}
        <button
          disabled={!file || loading}
          onClick={importLeads}
          className="w-full rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-200 transition-colors"
        >
          {loading ? "Importing…" : "Import Leads"}
        </button>
      </div>
    </div>
  );
}
