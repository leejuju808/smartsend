"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Seq = { id: string; name: string; created_at: string };

export default function SequencesList() {
  const [items, setItems] = useState<Seq[]>([]);
  const [name, setName] = useState("");

  const load = async () => {
    const res = await fetch("/api/sequences", { cache: "no-store" });
    const data = await res.json();
    setItems(data.sequences || []);
  };

  useEffect(() => { load(); }, []);

  const createSeq = async () => {
    if (!name.trim()) return;
    const res = await fetch("/api/sequences", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.sequence) {
      setName("");
      load();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Sequences</h1>

      <div className="flex gap-2 mb-6">
        <input value={name} onChange={(e) => setName(e.target.value)}
               placeholder="New sequence name" className="px-4 py-2 rounded-lg text-black w-full" />
        <button onClick={createSeq} className="px-4 py-2 rounded-lg bg-yellow-500 text-black font-semibold">Create</button>
      </div>

      <div className="space-y-3">
        {items.map((s) => (
          <Link key={s.id} href={`/sequences/${s.id}`} className="block border border-gray-800 rounded-xl p-4 hover:bg-gray-950">
            <div className="font-semibold">{s.name}</div>
            <div className="text-sm text-gray-400">Created {new Date(s.created_at).toLocaleString()}</div>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="border border-gray-800 rounded-xl p-8 text-gray-400">No sequences yet — create one above.</div>
        )}
      </div>
    </div>
  );
}