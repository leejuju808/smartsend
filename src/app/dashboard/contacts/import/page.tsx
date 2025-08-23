"use client";
import { useState } from "react";

type Row = { email: string; first_name?: string; last_name?: string; company?: string };

export default function ImportContactsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string>("");

  function dedupeByEmail(input: Row[]): Row[] {
    const m = new Map<string, Row>();
    for (const r of input) {
      const email = (r.email || "").trim().toLowerCase();
      if (!email) continue;
      if (!m.has(email)) m.set(email, { ...r, email });
    }
    return Array.from(m.values());
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    // Simple CSV parser: expects header line with: email,first_name,last_name,company
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = (lines.shift() || "").toLowerCase().split(",").map(s => s.trim());
    const idx = {
      email: header.indexOf("email"),
      first_name: header.indexOf("first_name"),
      last_name: header.indexOf("last_name"),
      company: header.indexOf("company"),
    };
    if (idx.email === -1) {
      setMsg("CSV must include an 'email' column.");
      return;
    }
    const out: Row[] = lines.map(line => {
      const cols = line.split(",");
      return {
        email: cols[idx.email]?.trim() || "",
        first_name: idx.first_name >= 0 ? cols[idx.first_name]?.trim() : undefined,
        last_name: idx.last_name >= 0 ? cols[idx.last_name]?.trim() : undefined,
        company: idx.company >= 0 ? cols[idx.company]?.trim() : undefined,
      };
    });

    const dd = dedupeByEmail(out);
    setRows(dd);
    setPreview(dd.slice(0, 50));
    setMsg(`Loaded ${out.length} rows → ${dd.length} unique by email. Showing first 50.`);
  }

  async function handleImport() {
    setMsg("Importing...");
    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(`Import failed: ${j.error || "Unknown error"}`);
      return;
    }
    setMsg(`Done: received=${j.received}, unique=${j.unique}, suppressed_skipped=${j.suppressed_skipped}, upserted=${j.upserted}`);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Import Contacts</h1>

      <div className="space-y-2">
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        <p className="text-sm text-gray-500">
          CSV headers expected: <code>email,first_name,last_name,company</code>
        </p>
        <a 
          href="/contacts_template.csv" 
          download 
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Download CSV template
        </a>
        <br />
        <a
          href="/demo-leads.csv"
          download
          onClick={async () => {
            try {
              await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ step: "import_contacts" }),
              });
            } catch (e) {
              console.error("Failed to mark onboarding step:", e);
            }
          }}
          className="inline-block mt-2 text-sm underline text-blue-600"
        >
          Download demo CSV
        </a>
      </div>

      {msg && <div className="p-3 rounded border text-sm">{msg}</div>}

      {preview.length > 0 && (
        <div className="border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">First</th>
                <th className="text-left p-2">Last</th>
                <th className="text-left p-2">Company</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">{r.first_name}</td>
                  <td className="p-2">{r.last_name}</td>
                  <td className="p-2">{r.company}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!rows.length}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        Import {rows.length ? `(${rows.length})` : ""}
      </button>
    </div>
  );
} 