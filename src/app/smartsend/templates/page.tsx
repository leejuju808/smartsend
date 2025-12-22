"use client";
import { useEffect, useState } from "react";
import { RewriterPanel } from "@/components/templates/rewriter-panel";
import { RewriterV2Panel } from "@/components/templates/rewriter-v2-panel";
import { VariantSelector } from "@/components/templates/variant-selector";

type Tpl = { id: string; name: string; subject: string; body: string; is_default: boolean; };

export default function TemplatesPage() {
  const [rows, setRows] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const empty: Tpl = { id: "", name: "New Template", subject: "Quick idea for {{company|your team}}", body: "Hey {{first_name|there}},\n\n…", is_default: false };
  
  // Example lead for personalization (in real app, this would come from context)
  const exampleLead = {
    first_name: "Ava",
    company: "Acme Co",
    industry: "SaaS",
    email: "ava@acme.co",
  };
  
  // Example user (in real app, this would come from auth context)
  const currentUser = {
    full_name: "Julian",
    email: "julian@smartsend.ai",
    company: "SmartSend",
  };

  async function load() {
    setLoading(true);
    const res = await fetch("/api/smartsend/templates");
    const data = await res.json();
    setRows(data.rows || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save(t: Tpl) {
    const method = t.id ? "PATCH" : "POST";
    const payload: any = t.id ? { id: t.id, name: t.name, subject: t.subject, body: t.body, is_default: t.is_default } : { name: t.name, subject: t.subject, body: t.body, is_default: t.is_default };
    const res = await fetch("/api/smartsend/templates", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.ok) { setEditing(null); load(); }
    else alert(data.error || "Failed");
  }

  async function setDefault(id: string) {
    const res = await fetch("/api/smartsend/templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, is_default: true }) });
    const data = await res.json();
    if (data.ok) load(); else alert(data.error || "Failed");
  }

  async function del(id: string) {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/smartsend/templates?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) load(); else alert(data.error || "Failed");
  }

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto text-white">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <button onClick={() => setEditing({ ...empty })} className="rounded-xl bg-yellow-400 text-black px-3 py-2 text-sm">New Template</button>
      </div>

      <div className="overflow-auto rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Default</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.subject}</td>
                <td className="p-3">{r.is_default ? "✅" : "—"}</td>
                <td className="p-3">
                  <button onClick={() => setEditing(r)} className="rounded-lg bg-zinc-800 px-2 py-1 text-xs mr-2">Edit</button>
                  {!r.is_default && (
                    <button onClick={() => setDefault(r.id)} className="rounded-lg bg-zinc-700 px-2 py-1 text-xs mr-2">Make default</button>
                  )}
                  <button onClick={() => del(r.id)} className="rounded-lg bg-red-500 text-black px-2 py-1 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td className="p-6 text-center text-zinc-400" colSpan={4}>No templates yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-black p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-3">{editing.id ? "Edit Template" : "New Template"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <input
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                  value={editing.name}
                  onChange={(e)=>setEditing({...editing, name:e.target.value})}
                  placeholder="Name"
                />
                <input
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                  value={editing.subject}
                  onChange={(e)=>setEditing({...editing, subject:e.target.value})}
                  placeholder="Subject"
                />
                <textarea
                  rows={10}
                  className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                  value={editing.body}
                  onChange={(e)=>setEditing({...editing, body:e.target.value})}
                  placeholder="Body (supports {{first_name}}, {{company}} …)"
                />
                <label className="inline-flex items-center gap-2 text-sm text-white">
                  <input type="checkbox" checked={editing.is_default} onChange={(e)=>setEditing({...editing, is_default:e.target.checked})}/>
                  Set as default
                </label>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={()=>setEditing(null)} className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-white">Cancel</button>
                  <button onClick={()=>save(editing)} className="rounded-xl bg-yellow-400 text-black px-3 py-2 text-sm">Save</button>
                </div>
              </div>
              <div className="space-y-4">
                <RewriterV2Panel
                  originalText={editing.body}
                  lead={exampleLead}
                  user={currentUser}
                  onVariants={(v) => setVariants(v)}
                />
                {variants.length > 0 && (
                  <VariantSelector
                    variants={variants}
                    onApply={(v) => {
                      setEditing({...editing, body: v});
                      setVariants([]); // Clear variants after selection
                    }}
                  />
                )}
                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-2">Legacy Rewriter:</p>
                  <RewriterPanel
                    originalText={editing.body}
                    onRewrite={(rewritten) => setEditing({...editing, body: rewritten})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="mt-4 text-sm text-zinc-400">Loading…</div>}
    </div>
  );
}