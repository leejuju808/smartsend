"use client";
import { useState } from "react";

export default function NewSequence(){
  const [name,setName]=useState("New Sequence");
  const [cap,setCap]=useState(300);
  async function create(){
    const r = await fetch("/api/sequences/create", {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify({ name, dailyCap: cap })
    });
    const j = await r.json();
    if (r.ok) location.href = `/sequences/${j.id}`;
    else alert(j.error || "Failed");
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Create sequence</h1>
      <div className="grid max-w-xl gap-3">
        <input className="border rounded p-2" value={name} onChange={e=>setName(e.target.value)} />
        <input className="border rounded p-2" type="number" value={cap} onChange={e=>setCap(parseInt(e.target.value||"0"))} />
        <button onClick={create} className="px-4 py-2 rounded bg-black text-white">Create</button>
      </div>
    </div>
  );
}