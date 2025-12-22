// app/dashboard/audience/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Contact = {
  id: string; email: string; first_name?: string | null; last_name?: string | null;
  company?: string | null; domain?: string | null; created_at: string;
};
type Filter = {
  q?: string;
  domains?: string[];
  companies?: string[];
  has_name?: boolean;
  created_from?: string;
  created_to?: string;
  limit?: number;
  offset?: number;
};

export default function AudiencePage() {
  const [q, setQ] = useState("");
  const [domains, setDomains] = useState<string>("");
  const [companies, setCompanies] = useState<string>("");
  const [hasName, setHasName] = useState(true);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Contact[]>([]);
  const [count, setCount] = useState<number>(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [segments, setSegments] = useState<Array<{id: string; name: string; definition: any}>>([]);
  const [segName, setSegName] = useState("");

  const filter: Filter = useMemo(() => ({
    q: q.trim() || undefined,
    domains: domains.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    companies: companies.split(",").map(s => s.trim()).filter(Boolean),
    has_name: hasName || undefined,
    created_from: from || undefined,
    created_to: to || undefined,
    limit: pageSize,
    offset: page * pageSize,
  }), [q, domains, companies, hasName, from, to, page]);

  async function fetchSegments() {
    const r = await fetch("/api/segments");
    const j = await r.json();
    if (j?.items) setSegments(j.items);
  }

  async function preview() {
    setBusy(true);
    try {
      const r = await fetch("/api/contacts/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Query failed");
      setItems(j.items || []);
      setCount(j.total ?? (j.items?.length || 0));
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSegment() {
    const name = segName.trim();
    if (!name) { alert("Name required"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, definition: filter }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setSegName("");
      await fetchSegments();
      alert("Segment saved");
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  function loadSegment(def: Filter) {
    setQ(def.q || "");
    setDomains((def.domains || []).join(","));
    setCompanies((def.companies || []).join(","));
    setHasName(!!def.has_name);
    setFrom(def.created_from || "");
    setTo(def.created_to || "");
    setPage(0);
  }

  useEffect(() => { fetchSegments(); }, []);

  useEffect(() => { preview(); }, [page]); // paginate

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Audience Builder</h1>
        <div className="text-sm text-gray-600">Previewing {items.length} / {count} contacts</div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4 border rounded-2xl p-4">
          <div className="grid md:grid-cols-2 gap-3">
            <input className="border rounded-xl p-2 text-sm" placeholder="Search (name, email, company, domain)"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasName} onChange={(e) => setHasName(e.target.checked)} />
              Has name
            </label>
            <input className="border rounded-xl p-2 text-sm" placeholder="Domains (comma: gmail.com,yahoo.com)"
              value={domains} onChange={(e) => setDomains(e.target.value)} />
            <input className="border rounded-xl p-2 text-sm" placeholder="Companies (comma: Acme,Wayne)"
              value={companies} onChange={(e) => setCompanies(e.target.value)} />
            <input type="date" className="border rounded-xl p-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="border rounded-xl p-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setPage(0); preview(); }} disabled={busy}
              className="px-4 py-2 rounded-2xl shadow text-white bg-black disabled:opacity-50">
              {busy ? "Loading…" : "Preview"}
            </button>

            <input className="border rounded-xl p-2 text-sm" placeholder="Segment name (save current filters)"
              value={segName} onChange={(e) => setSegName(e.target.value)} />
            <button onClick={saveSegment} disabled={busy || !segName.trim()}
              className="px-4 py-2 rounded-2xl shadow text-white bg-black disabled:opacity-50">
              Save Segment
            </button>

            {/* Link to campaign builder with segment—adjust route if yours differs */}
            <a
              href={`/dashboard/campaigns/new?segment=${encodeURIComponent(JSON.stringify(filter))}`}
              className="px-4 py-2 rounded-2xl shadow text-white bg-black"
            >
              Use in Campaign
            </a>
          </div>

          <div className="overflow-auto border rounded-2xl">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Company</th>
                  <th className="text-left p-2">Domain</th>
                  <th className="text-left p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{c.email}</td>
                    <td className="p-2">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="p-2">{c.company || "—"}</td>
                    <td className="p-2">{c.domain || "—"}</td>
                    <td className="p-2">{new Date(c.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td className="p-3 text-gray-500" colSpan={5}>No results</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div>Page {page + 1} of {totalPages}</div>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || busy}
                className="px-3 py-1 rounded-xl border disabled:opacity-50">Prev</button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || busy}
                className="px-3 py-1 rounded-xl border disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>

        <div className="space-y-3 border rounded-2xl p-4">
          <div className="text-sm font-semibold">Saved Segments</div>
          <ul className="text-sm space-y-2">
            {segments.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <button className="underline" onClick={async () => {
                  const r = await fetch(`/api/segments/${s.id}`);
                  const j = await r.json();
                  if (j?.item?.definition) loadSegment(j.item.definition);
                }}>
                  {s.name}
                </button>
                <a className="text-xs px-2 py-1 rounded-xl border"
                   href={`/dashboard/campaigns/new?segment_id=${s.id}`}>
                  Use
                </a>
              </li>
            ))}
            {segments.length === 0 && <li className="text-gray-500">No segments yet</li>}
          </ul>

          <div className="text-xs text-gray-600">
            Notes: Suppressed emails are always excluded. CSV import adds contacts; set rules here to target them.
          </div>
        </div>
      </div>
    </div>
  );
} 