// /app/dashboard/suppressions/page.tsx
// Suppression List Manager (App Router, client component)
// - Add single email with optional reason/source
// - CSV upload (email, reason?, source?) with header mapping
// - List current suppressions with delete
// - Uses Supabase RLS; requires signed-in session

"use client";

import React from "react";
import Papa from "papaparse";
import { getBrowserSupabase } from "@/lib/supabase";
import { normalizeEmail } from "@/lib/csv/importContacts"; // reuse normalizer
import { bulkImportSuppressions } from "@/lib/csv/importSuppressions";

type SuppressionRow = {
  id: string;
  email: string;
  reason: string | null;
  source: string | null;
  created_at: string;
};

type RawRow = Record<string, string | null | undefined>;

export default function SuppressionsPage() {
  const supabase = React.useMemo(() => getBrowserSupabase(), []);
  const [authWarning, setAuthWarning] = React.useState<string | null>(null);

  // Manual add form
  const [email, setEmail] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [source, setSource] = React.useState("manual");
  const [adding, setAdding] = React.useState(false);

  // Table data
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<SuppressionRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // CSV state
  const [csvFileName, setCsvFileName] = React.useState("");
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [csvRows, setCsvRows] = React.useState<RawRow[]>([]);
  const [csvParsing, setCsvParsing] = React.useState(false);
  const [csvSummary, setCsvSummary] = React.useState<null | {
    attempted: number;
    imported: number;
    duplicates_in_file: number;
    errors: string[];
  }>(null);
  const [mapEmail, setMapEmail] = React.useState("");
  const [mapReason, setMapReason] = React.useState("");
  const [mapSource, setMapSource] = React.useState("");

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        setAuthWarning("You must be signed in to manage suppressions.");
        setLoading(false);
        return;
      }
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("suppressions_v2")
      .select("id,email,reason,source,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setError(error.message);
    } else {
      setRows((data ?? []) as SuppressionRow[]);
    }
    setLoading(false);
  }

  async function onAdd() {
    const e = normalizeEmail(email || "");
    if (!e) return;
    setAdding(true);
    setError(null);
    const { error } = await supabase.from("suppressions_v2").insert({
      profile_id: (await supabase.auth.getUser()).data.user?.id,
      email: e,
      reason: reason || null,
      source: source || "manual",
    });
    if (error) {
      // Unique violation → treat as no-op for UX
      if ((error as any).code === "23505") {
        setError("That email is already suppressed.");
      } else {
        setError(error.message);
      }
    } else {
      setEmail("");
      setReason("");
      await refresh();
    }
    setAdding(false);
  }

  async function onDelete(id: string) {
    setError(null);
    const { error } = await supabase.from("suppressions_v2").delete().eq("id", id);
    if (error) {
      setError(error.message);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  }

  function onCsvFile(file: File) {
    setCsvFileName(file.name);
    setCsvParsing(true);
    setCsvSummary(null);
    setCsvHeaders([]);
    setCsvRows([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = (results.data || []) as RawRow[];
        const hdrs = data.length > 0 ? Object.keys(data[0] ?? {}) : [];
        setCsvHeaders(hdrs);

        // auto-guess
        const eGuess = hdrs.find((h) => h.toLowerCase().includes("email")) || "";
        const rGuess =
          hdrs.find((h) =>
            ["reason", "status", "type"].includes(h.toLowerCase())
          ) || "";
        const sGuess =
          hdrs.find((h) => ["source", "origin"].includes(h.toLowerCase())) ||
          "import";

        setMapEmail(eGuess);
        setMapReason(rGuess);
        setMapSource(sGuess);

        setCsvRows(data);
        setCsvParsing(false);
      },
      error: (error) => {
        setCsvParsing(false);
        setError("Failed to parse CSV. Check the file format.");
      },
    });
  }

  async function onCsvImport() {
    if (!mapEmail || !csvRows.length) return;
    setError(null);
    setCsvSummary(null);
    try {
      const res = await bulkImportSuppressions(csvRows, {
        email: mapEmail,
        reason: mapReason || "",
        source: mapSource || "",
      });
      setCsvSummary(res);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Suppression List</h1>
        <p className="text-sm text-gray-500">
          Emails here will be skipped during imports and sending. Add manually or upload a CSV.
        </p>
      </div>

      {authWarning && (
        <div className="mb-6 rounded-md border border-amber-400 bg-amber-50 p-4 text-amber-700">
          {authWarning}
        </div>
      )}

      {/* Manual add */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold">Add Email</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="source (manual/import/system)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <button
            onClick={onAdd}
            disabled={!normalizeEmail(email) || !!authWarning || adding}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              !normalizeEmail(email) || !!authWarning || adding
                ? "bg-gray-400"
                : "bg-black hover:bg-gray-800"
            }`}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* CSV uploader */}
      <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold">Bulk Upload via CSV</h2>
        <p className="mt-1 text-xs text-gray-500">
          Headers: <span className="font-mono">email</span> (required),{" "}
          <span className="font-mono">reason</span> (optional),{" "}
          <span className="font-mono">source</span> (optional)
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCsvFile(f);
            }}
            className="block w-full text-sm text-gray-900 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200 md:w-auto"
          />
          {csvFileName && (
            <span className="text-xs text-gray-500">Selected: {csvFileName}</span>
          )}
        </div>

        {csvParsing && <div className="mt-4 text-sm text-gray-600">Parsing CSV…</div>}

        {!!csvHeaders.length && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FieldSelect
              label="Email *"
              value={mapEmail}
              onChange={setMapEmail}
              options={csvHeaders}
              required
            />
            <FieldSelect
              label="Reason"
              value={mapReason}
              onChange={setMapReason}
              options={["", ...csvHeaders]}
            />
            <FieldSelect
              label="Source"
              value={mapSource}
              onChange={setMapSource}
              options={["", ...csvHeaders]}
            />
          </div>
        )}

        {!!csvHeaders.length && (
          <div className="mt-3">
            <button
              onClick={onCsvImport}
              disabled={!mapEmail || !!authWarning}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                !mapEmail || !!authWarning ? "bg-gray-400" : "bg-black hover:bg-gray-800"
              }`}
            >
              Import CSV to Suppressions
            </button>
          </div>
        )}

        {csvSummary && (
          <div className="mt-4 rounded border bg-gray-50 p-4">
            <h4 className="text-sm font-semibold">Import Summary</h4>
            <ul className="mt-2 list-inside list-disc text-sm text-gray-700">
              <li>Attempted: {csvSummary.attempted}</li>
              <li>Imported: {csvSummary.imported}</li>
              <li>Skipped — Duplicates in file: {csvSummary.duplicates_in_file}</li>
            </ul>
            {csvSummary.errors.length > 0 && (
              <div className="mt-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">Errors</p>
                <ul className="mt-1 list-inside list-disc">
                  {csvSummary.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Current Suppressions</h2>
          <button
            onClick={refresh}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="mt-4 text-sm text-gray-500">No suppressed emails yet.</div>
        ) : (
          <div className="mt-3 overflow-auto rounded border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-700">Email</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Reason</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Source</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">{r.reason ?? ""}</td>
                    <td className="px-3 py-2">{r.source ?? ""}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onDelete(r.id)}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      <select
        className="w-full rounded-md border px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "— none —"}
          </option>
        ))}
      </select>
    </label>
  );
}

