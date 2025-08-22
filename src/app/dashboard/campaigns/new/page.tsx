"use client";
import { useState } from "react";

export default function NewCampaignPage() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {{name}},\n\nQuick note…");
  const [tagsAny, setTagsAny] = useState("");
  const [includeDomains, setIncludeDomains] = useState("");
  const [excludeDomains, setExcludeDomains] = useState("");
  const [includeUnsub, setIncludeUnsub] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);

  async function create() {
    setCreating(true);
    const segment = {
      tagsAny: split(tagsAny),
      includeDomains: split(includeDomains),
      excludeDomains: split(excludeDomains),
      includeUnsubscribed: includeUnsub,
      search: ""
    };
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, body_html: toHtml(body), segment }),
    });
    const j = await res.json();
    setCreating(false);
    if (j?.ok) {
      setCreatedId(j.campaign.id);
      setPreviewTotal(j.campaign.total);
    } else {
      alert(j?.error || "Failed");
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">New campaign</h1>

      <div className="grid gap-3">
        <input className="rounded-xl border p-2" placeholder="Internal name" value={name} onChange={e=>setName(e.target.value)} />
        <input className="rounded-xl border p-2" placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)} />
        <textarea className="min-h-[200px] rounded-xl border p-3 font-mono" value={body} onChange={e=>setBody(e.target.value)} />
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-medium">Segment</div>
        <Input label="Tags (any match)" value={tagsAny} onChange={setTagsAny} placeholder="lead, trial, imported-2025-08" />
        <Input label="Include domains" value={includeDomains} onChange={setIncludeDomains} placeholder="company.com, example.org" />
        <Input label="Exclude domains" value={excludeDomains} onChange={setExcludeDomains} placeholder="gmail.com" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeUnsub} onChange={e=>setIncludeUnsub(e.target.checked)} /> Include unsubscribed (not recommended)
        </label>
      </div>

      <button onClick={create} disabled={creating} className="rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50">
        {creating ? "Creating…" : "Save draft & preview"}
      </button>

      {createdId && (
        <div className="rounded-xl border p-4 text-sm">
          Audience size: <b>{previewTotal}</b>
          <div className="mt-3">
            <a className="underline" href={`/dashboard/campaigns/${createdId}`}>Open campaign</a>
          </div>
        </div>
      )}
    </div>
  );
}

function split(s: string) { return s.split(/[\,\s]+/).map(x=>x.trim()).filter(Boolean); }
function toHtml(s: string) { return s.replace(/\n/g, "<br/>"); }
function Input({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <input className="mt-1 w-full rounded-xl border p-2" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
    </div>
  );
}

