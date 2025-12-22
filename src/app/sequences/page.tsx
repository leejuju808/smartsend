"use client";
import useSWR from "swr";
const f = (u:string)=>fetch(u).then(r=>r.json());

export default function SequencesPage(){
  const { data, mutate } = useSWR("/api/sequences/list", f);
  const seqs = data?.sequences || [];
  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Sequences</h1>
        <a href="/sequences/new" className="px-3 py-2 rounded bg-black text-white">New sequence</a>
      </div>
      <div className="grid gap-3">
        {seqs.map((s:any)=>(
          <a key={s.id} href={`/sequences/${s.id}`} className="border rounded-xl p-4 hover:bg-gray-50">
            <div className="flex justify-between">
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-gray-600">{s.active ? "Active" : "Paused"}</div>
            </div>
            <div className="text-sm text-gray-600">Daily cap: {s.daily_cap}</div>
          </a>
        ))}
      </div>
    </div>
  );
}