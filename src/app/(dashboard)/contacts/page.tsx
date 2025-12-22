"use client";
import useSWR from "swr";
import { useState } from "react";
const fetcher=(u:string)=>fetch(u).then(r=>r.json());

export default function ContactsPage() {
  const [q,setQ]=useState("");
  const { data, mutate } = useSWR(`/api/contacts${q?`?q=${encodeURIComponent(q)}`:""}`, fetcher);
  const [file,setFile]=useState<File|null>(null);

  async function upload(){
    if(!file) return alert("Choose CSV");
    const fd = new FormData(); fd.set("file", file);
    const res = await fetch("/api/contacts/bulk", { method:"POST", body: fd });
    const j = await res.json(); if(!res.ok||!j.ok) return alert(j.error||"Upload failed");
    setFile(null); mutate();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Contacts</h1>

      <div className="flex gap-2 items-center">
        <input className="border rounded px-2 py-1" placeholder="Search name/email/company" value={q} onChange={e=>setQ(e.target.value)} />
        <div className="ml-auto flex items-center gap-2">
          <input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0]||null)} />
          <button className="border rounded px-3 py-1" onClick={upload}>Import CSV</button>
        </div>
      </div>

      <div className="border rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left">
            <th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Company</th><th className="py-2 pr-3">Tags</th><th className="py-2 pr-3">Attrs</th>
          </tr></thead>
          <tbody>
            {(data?.contacts??[]).map((c:any)=>(
              <tr key={c.id} className="border-t">
                <td className="py-2 pr-3">{c.email}</td>
                <td className="py-2 pr-3">{[c.first_name,c.last_name].filter(Boolean).join(" ")}</td>
                <td className="py-2 pr-3">{c.company||"—"}</td>
                <td className="py-2 pr-3">{(c.tags||[]).join(", ")||"—"}</td>
                <td className="py-2 pr-3 truncate max-w-[360px]">{JSON.stringify(c.attrs||{})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
