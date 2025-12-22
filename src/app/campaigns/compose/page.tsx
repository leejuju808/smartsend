"use client";
import { useEffect, useState } from "react";
import SmartRewriter from "@/components/compose/SmartRewriter";

export default function ComposeCampaign() {
  const [leads, setLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("Quick question for {{first_name}} at {{company}}");
  const [text, setText] = useState("Hi {{first_name}},\n\nI noticed {{company}} ...");
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/leads/list");
      const j = await r.json();
      setLeads(j.items ?? []);
    })();
  }, []);

  async function enqueue() {
    setStatus("Enqueuing…");
    const res = await fetch("/api/campaigns/enqueue", {
      method:"POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        campaign_id: crypto.randomUUID(),
        lead_ids: Array.from(selected),
        subject_tmpl: subject,
        text_tmpl: text,
        html_tmpl: html || null
      })
    });
    const j = await res.json();
    setStatus(res.ok ? `Enqueued ${j.enqueued} emails` : `Error: ${j.error}`);
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Compose & Enqueue</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400 mb-2">Subject</div>
          <input value={subject} onChange={e=>setSubject(e.target.value)} className="w-full bg-transparent border border-zinc-700 rounded-xl px-3 py-2" />
          <div className="text-sm text-zinc-400 my-2">Text (fallback)</div>
          <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full h-40 bg-transparent border border-zinc-700 rounded-xl p-3" />
          <div className="text-sm text-zinc-400 my-2">HTML (optional)</div>
          <textarea value={html} onChange={e=>setHtml(e.target.value)} className="w-full h-40 bg-transparent border border-zinc-700 rounded-xl p-3" />
        </div>
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-zinc-400">Leads</div>
            <button className="text-xs underline" onClick={()=>setSelected(new Set(leads.map(l=>l.id)))}>Select all</button>
          </div>
          <div className="max-h-[420px] overflow-auto space-y-2">
            {leads.map(l=>(
              <label key={l.id} className="flex items-center gap-2 p-2 rounded-xl border border-zinc-800">
                <input type="checkbox" checked={selected.has(l.id)} onChange={e=>{
                  setSelected(prev => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(l.id); else n.delete(l.id);
                    return n;
                  });
                }}/>
                <div className="text-sm">{l.email} <span className="text-zinc-500">— {l.first_name} {l.last_name} · {l.company}</span></div>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={enqueue} className="px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20">Enqueue</button>
            <div className="text-sm text-zinc-400">{status}</div>
          </div>
        </div>
      </div>
      
      <SmartRewriter
        valueSubject={subject}
        valueText={text}
        valueHtml={html}
        onApply={(v)=>{ setSubject(v.subject); setText(v.text); setHtml(v.html||""); }}
      />
    </div>
  );
}

