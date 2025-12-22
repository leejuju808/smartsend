"use client";
import { useState, useEffect } from "react";

type Row = { email: string; name?: string; company?: string; title?: string; phone?: string; tags?: string };
type Tpl = { id: string; name: string; subject: string };

function parseCSV(text: string): Row[] {
  // very small CSV parser (expects header row)
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    const obj: Row = { email: "" };
    if (idx("email") >= 0) obj.email = cols[idx("email")] || "";
    if (idx("name") >= 0) obj.name = cols[idx("name")] || undefined;
    if (idx("company") >= 0) obj.company = cols[idx("company")] || undefined;
    if (idx("title") >= 0) obj.title = cols[idx("title")] || undefined;
    if (idx("phone") >= 0) obj.phone = cols[idx("phone")] || undefined;
    if (idx("tags") >= 0) obj.tags = cols[idx("tags")] || undefined;
    if (obj.email) rows.push(obj);
  }
  return rows;
}

export default function UploadContactsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [seqName, setSeqName] = useState("Outbound — Warm Leads");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/smartsend/templates");
      const data = await res.json();
      const list = data.rows || [];
      setTemplates(list);
      const def = list.find((t:Tpl)=>t.is_default) || list[0];
      if (def) setTemplateId(def.id);
    })();
  }, []);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCSV(text);
    setRows(parsed);
  }

  async function importContacts() {
    if (!rows.length) return;
    setLoading(true); setMsg("");
    // convert tag string → array
    const mapped = rows.map(r => ({ ...r, tags: (r.tags || "").split("|").map(s => s.trim()).filter(Boolean) }));
    const res = await fetch("/api/smartsend/contacts-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: mapped }),
    });
    const data = await res.json();
    setMsg(data.ok ? `Imported ${data.inserted} contacts` : `Error: ${data.error || "Failed"}`);
    setLoading(false);
  }

  async function scheduleMany() {
    if (!rows.length) return;
    setLoading(true); setMsg("");
    const emails = rows.map(r => r.email.toLowerCase());
    const res = await fetch("/api/smartsend/schedule-many", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_emails: emails, sequence_name: seqName, template_id: templateId }),
    });
    const data = await res.json();
    setMsg(data.ok ? `Queued ${data.jobs_count} jobs for ${emails.length} contacts` : `Error: ${data.error || "Failed"}`);
    setLoading(false);
  }

  return (
    <div className="min-h-[70vh] px-4 py-8 text-white">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-6">
          <h1 className="text-2xl font-semibold mb-2">Upload Contacts (CSV)</h1>
          <p className="text-sm text-zinc-400 mb-4">
            CSV headers supported: <code>email,name,company,title,phone,tags</code>. Use <code>|</code> to separate multiple tags.
          </p>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            className="block mb-3"
          />

          {!!rows.length && (
            <>
              <div className="text-sm text-zinc-400 mb-2">Preview ({rows.length} rows):</div>
              <div className="max-h-64 overflow-auto rounded-xl border border-zinc-900">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900/60">
                    <tr className="text-left">
                      <th className="p-2">Email</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Company</th>
                      <th className="p-2">Title</th>
                      <th className="p-2">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">{r.name || "—"}</td>
                        <td className="p-2">{r.company || "—"}</td>
                        <td className="p-2">{r.title || "—"}</td>
                        <td className="p-2">{r.tags || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="block text-sm mb-1">Template</label>
                  <select
                    value={templateId}
                    onChange={(e)=>setTemplateId(e.target.value)}
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
                  >
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Sequence name</label>
                  <input
                    value={seqName}
                    onChange={(e) => setSeqName(e.target.value)}
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <button
                  onClick={importContacts}
                  disabled={loading}
                  className="rounded-2xl bg-zinc-800 border border-zinc-700 px-4 py-2"
                >
                  {loading ? "Working…" : "Import Contacts"}
                </button>

                <button
                  onClick={scheduleMany}
                  disabled={loading}
                  className="rounded-2xl bg-yellow-400 text-black px-4 py-2"
                >
                  {loading ? "Queueing…" : "Schedule to All"}
                </button>
              </div>
            </>
          )}

          {msg && <div className="mt-4 text-sm text-zinc-300">{msg}</div>}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-6">
          <h2 className="text-lg font-semibold mb-2">Template CSV</h2>
          <pre className="text-xs bg-zinc-900 p-3 rounded-xl overflow-x-auto">
{`email,name,company,title,phone,tags
ceo@example.com,Ada Lovelace,Analytical Engines,CEO,,warm|demo
cto@example.com,Alan Turing,Computation Ltd,CTO,,cold|ai`}
          </pre>
        </div>
      </div>
    </div>
  );
}