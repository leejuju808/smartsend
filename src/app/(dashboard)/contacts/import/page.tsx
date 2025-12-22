"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UpgradeNudge from "@/components/UpgradeNudge";
import PaywallGate from "@/components/PaywallGate";

type Summary = {
  total_rows: number;
  accepted: number;
  inserted: number;
  updated: number;
  skipped: { row: any; reason: string }[];
  sample: any[];
  error?: string;
};

const DEFAULT_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "phone", label: "Phone" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags (comma/semicolon)" },
];

export default function ImportContactsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>(
    DEFAULT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {} as Record<string, string>)
  );
  const [parsingHeadersError, setParsingHeadersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const requiredMissing = useMemo(() => {
    return DEFAULT_FIELDS
      .filter((f) => f.required)
      .some((f) => !mapping[f.key] || mapping[f.key].trim() === "");
  }, [mapping]);

  function reset() {
    setFile(null);
    setHeaders([]);
    setSummary(null);
    setParsingHeadersError(null);
  }

  async function inferHeadersFromFile(f: File) {
    setParsingHeadersError(null);
    try {
      const text = await f.text();
      const first = text.split(/\r?\n/)[0] || "";
      const cols = first.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      if (!cols.length || cols.length === 1) {
        setParsingHeadersError("Could not infer CSV headers — ensure the first row is a header row.");
      } else {
        setHeaders(cols);
      }
    } catch (e: any) {
      setParsingHeadersError(e?.message || "Failed to read file.");
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setSummary(null);
    if (f) await inferHeadersFromFile(f);
  }

  async function onSubmit() {
    if (!file) return;
    if (!userId) {
      alert("Enter user_id (dev). In prod, this is derived from the session.");
      return;
    }
    setLoading(true);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("user_id", userId);
      // column mappings
      Object.entries(mapping).forEach(([k, v]) => fd.append(`map_${k}`, v));

      const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const data = (await res.json()) as Summary;
      if (!res.ok) throw new Error(data?.error || "Import failed");
      setSummary(data);
    } catch (e: any) {
      setSummary({ total_rows: 0, accepted: 0, inserted: 0, updated: 0, skipped: [], sample: [], error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Import Contacts</h1>
          <p className="text-sm text-muted-foreground">CSV → Dedupe → Suppression. No list drama.</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="user_id (dev only)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-72"
          />
          <Button variant="outline" onClick={reset}>Reset</Button>
        </div>
      </div>

      {userId && <UpgradeNudge userId={userId} feature="CSV import" />}

      <div className="rounded-2xl border p-6 shadow-sm space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Upload CSV</div>
            <Input type="file" accept=".csv,text/csv" onChange={onFileChange} />
            {parsingHeadersError && <div className="text-sm text-destructive">{parsingHeadersError}</div>}
            <p className="text-xs text-muted-foreground">
              First row should be headers. UTF-8 CSV. Common headers like email, first_name, last_name, etc.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Detected Headers</div>
            <div className="rounded-lg border p-3 text-sm min-h-[42px]">
              {headers.length ? headers.join(", ") : <span className="opacity-60">—</span>}
            </div>
            <p className="text-xs text-muted-foreground">We'll map these to your contact fields.</p>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="mb-3 text-sm font-medium">Column Mapping</div>
          <div className="grid gap-3 md:grid-cols-2">
            {DEFAULT_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <label className="w-48 text-sm">{f.label}{f.required ? " *" : ""}</label>
                <select
                  className="h-10 w-full rounded-2xl border px-3 text-sm"
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— Not Mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                  {/* Allow manual type-in fallbacks */}
                  <option value={f.key}>({f.key})</option>
                </select>
              </div>
            ))}
          </div>

          <div className="mt-4">
            {userId ? (
              <PaywallGate
                userId={userId}
                fallback={
                  <Button disabled className="opacity-60 cursor-not-allowed">
                    Start Import (Pro)
                  </Button>
                }
              >
                <Button onClick={onSubmit} disabled={!file || requiredMissing || loading}>
                  {loading ? "Importing..." : "Start Import"}
                </Button>
              </PaywallGate>
            ) : (
              <Button onClick={onSubmit} disabled={!file || requiredMissing || loading}>
                {loading ? "Importing..." : "Start Import"}
              </Button>
            )}
            {requiredMissing && (
              <div className="mt-2 text-sm text-destructive">Email is required — map it before importing.</div>
            )}
          </div>
        </div>
      </div>

      {summary && (
        <div className="rounded-2xl border p-6 shadow-sm space-y-4">
          <div className="text-lg font-medium">Import Summary</div>
          {summary.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
              {summary.error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total Rows" value={summary.total_rows} />
            <Stat label="Accepted" value={summary.accepted} />
            <Stat label="Inserted" value={summary.inserted} />
            <Stat label="Updated" value={summary.updated} />
          </div>

          {summary.skipped?.length ? (
            <div className="text-sm">
              <div className="font-medium mb-1">Skipped ({summary.skipped.length})</div>
              <div className="rounded-lg border p-3 max-h-64 overflow-auto text-xs">
                {summary.skipped.slice(0, 100).map((s, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <span className="min-w-24 inline-block opacity-60">{s.reason}</span>
                    <span className="truncate">{s.row?.email || JSON.stringify(s.row)}</span>
                  </div>
                ))}
                {summary.skipped.length > 100 && (
                  <div className="opacity-60 mt-1">…and {summary.skipped.length - 100} more</div>
                )}
              </div>
            </div>
          ) : null}

          <div className="text-sm">
            <div className="font-medium mb-1">Sample (first 5 upserts)</div>
            <div className="rounded-lg border p-3 max-h-64 overflow-auto text-xs">
              {summary.sample?.length ? (
                summary.sample.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <span className="min-w-24 inline-block opacity-60">{r.email}</span>
                    <span className="truncate">{r.company || "—"}</span>
                  </div>
                ))
              ) : (
                <div className="opacity-60">—</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border p-4 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
