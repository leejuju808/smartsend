"use client";
import Link from "next/link"; 
import { useState, useEffect } from "react";

export default function SegmentsIndex(){
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [name,setName]=useState("Gmail + SaaS");
  const [definition,setDef]=useState(JSON.stringify({op:"and",rules:[{field:"email",op:"contains",value:"@gmail.com"},{field:"attr.industry",op:"equals",value:"SaaS"}]}, null, 2));

  async function fetchSegments() {
    setLoading(true);
    try {
      const res = await fetch("/api/segments");
      const data = await res.json();
      if (data.ok) {
        setSegments(data.segments || []);
      }
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSegments();
  }, []);

  async function create(){
    const res = await fetch("/api/segments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,definition:JSON.parse(definition)})});
    const j = await res.json(); if(!res.ok||!j.ok) return alert(j.error||"Create failed"); 
    setName(""); 
    fetchSegments(); // Refresh the list
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Segments</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4">
          <div className="text-sm font-medium mb-2">New Segment</div>
          <input className="border rounded px-2 py-1 w-full mb-2" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          <textarea className="border rounded px-2 py-1 w-full h-40 font-mono text-xs" value={definition} onChange={e=>setDef(e.target.value)} />
          <button className="border rounded px-3 py-1 mt-2" onClick={create}>Create</button>
        </div>
        <div className="border rounded-xl p-4">
          <div className="text-sm font-medium mb-2">Existing</div>
          {loading && <div className="text-center py-4">Loading...</div>}
          <ul className="list-disc pl-6">
            {segments.map((s:any)=>(
              <li key={s.id}><Link className="underline" href={`/segments/${s.id}`}>{s.name}</Link> <span className="text-xs text-muted-foreground ml-1">({s.status})</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}