"use client";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
const fetcher=(u:string)=>fetch(u).then(r=>r.json());

export default function SegmentDetail({ params }:{ params:{ id:string }}) {
  const { data, mutate } = useSWR(`/api/segments/${params.id}`, fetcher);
  const { data: sequences } = useSWR("/api/sequences", fetcher);
  const [name,setName]=useState(""); const [def,setDef]=useState("");
  const [preview, setPreview] = useState<any[]|null>(null);
  const [seq, setSeq] = useState<string>("");

  if (data?.segment && !name && !def) setTimeout(()=>{ setName(data.segment.name); setDef(JSON.stringify(data.segment.definition, null, 2)); }, 0);

  async function save(){
    const res = await fetch(`/api/segments/${params.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, definition: JSON.parse(def) })});
    const j = await res.json(); if(!res.ok||!j.ok) return alert(j.error||"Save failed"); mutate();
  }
  async function doPreview(){
    const res = await fetch(`/api/segments/${params.id}/preview`, { method:"POST" });
    const j = await res.json(); if(!res.ok||!j.ok) return alert(j.error||"Preview failed"); setPreview(j.contacts);
  }
  async function enroll(){
    if(!seq) return alert("Choose a sequence");
    const res = await fetch(`/api/segments/${params.id}/enroll`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ sequenceId: seq })});
    const j = await res.json(); if(!res.ok||!j.ok) return alert(j.error||"Enroll failed"); alert(`Enrolled ${j.inserted}`);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Segment</h1>
        <Link className="underline text-sm" href="/segments">Back</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 space-y-2">
          <label className="text-sm">Name</label>
          <input className="border rounded px-2 py-1 w-full" value={name} onChange={e=>setName(e.target.value)} />
          <label className="text-sm mt-2">Definition (JSON)</label>
          <textarea className="border rounded px-2 py-1 w-full h-72 font-mono text-xs" value={def} onChange={e=>setDef(e.target.value)} />
          <div className="flex gap-2">
            <button className="border rounded px-3 py-1" onClick={save}>Save</button>
            <button className="border rounded px-3 py-1" onClick={doPreview}>Preview Matches</button>
          </div>
        </div>

        <div className="border rounded-xl p-4">
          <div className="text-sm font-medium mb-2">Preview</div>
          <div className="text-xs text-muted-foreground mb-2">Shows up to 500 contacts</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Company</th></tr></thead>
              <tbody>
                {(preview??[]).map((c:any, i:number)=>(
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-3">{c.email}</td>
                    <td className="py-2 pr-3">{[c.first_name,c.last_name].filter(Boolean).join(" ")}</td>
                    <td className="py-2 pr-3">{c.company||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <div className="text-sm mb-1">Enroll matches into sequence</div>
            <div className="flex gap-2">
              <select className="border rounded px-2 py-1" value={seq} onChange={e=>setSeq(e.target.value)}>
                <option value="">Select sequence</option>
                {(sequences?.sequences??[]).map((s:any)=>(<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
              <button className="border rounded px-3 py-1" onClick={enroll} disabled={!seq}>Enroll</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}