"use client";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function SequencesIndex() {
  const { data, mutate } = useSWR("/api/sequences-new", fetcher);
  const [name, setName] = useState("New Sequence");
  
  async function create() {
    const res = await fetch("/api/sequences-new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const j = await res.json(); 
    if (!res.ok || !j.ok) return alert(j.error || "Create failed"); 
    setName(""); 
    mutate();
  }
  
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Sequences</h1>
      <div className="flex gap-2">
        <input 
          className="border rounded px-2 py-1" 
          value={name} 
          onChange={e => setName(e.target.value)} 
        />
        <button 
          className="border rounded px-3 py-1" 
          onClick={create}
        >
          Create
        </button>
      </div>
      <ul className="list-disc pl-6">
        {(data?.sequences || []).map((s: any) => (
          <li key={s.id}>
            <Link className="underline" href={`/sequences-new/${s.id}`}>
              {s.name}
            </Link> 
            <span className="text-xs text-muted-foreground ml-1">
              ({s.status})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}