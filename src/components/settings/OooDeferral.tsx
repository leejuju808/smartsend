"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";

type KW = { id: string; user_id: string|null; phrase: string };

export function OooDeferral() {
  const [global, setGlobal] = useState<KW[]>([]);
  const [mine, setMine] = useState<KW[]>([]);
  const [newPhrase, setNewPhrase] = useState("");
  const [days, setDays] = useState(7);

  async function load() {
    const r = await fetch("/api/ooo/keywords");
    const j = await r.json();
    if (r.ok) {
      setGlobal(j.global||[]);
      setMine(j.mine||[]);
    }
  }

  useEffect(()=>{ load(); }, []);

  async function add() {
    if (!newPhrase.trim()) return;
    const r = await fetch("/api/ooo/keywords", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ phrase: newPhrase.trim() })
    });
    if (r.ok) {
      setNewPhrase("");
      await load();
    } else {
      const j = await r.json();
      alert(j.error || "Add failed");
    }
  }

  async function remove(id: string) {
    const r = await fetch(`/api/ooo/keywords?id=${id}`, { method:"DELETE" });
    if (r.ok) load();
    else {
      const j = await r.json();
      alert(j.error || "Delete failed");
    }
  }

  async function backfill() {
    const r = await fetch("/api/ooo/backfill", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ days: 60, deferral_days: days })
    });
    const j = await r.json();
    if (!r.ok) alert(j.error || "Backfill failed");
    else alert(`OOO flagged on ${j.updated} threads (deferred ${j.deferral_days}d)`);
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm font-medium">Out-of-Office Deferral</div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Global patterns</Label>
          <ul className="text-sm list-disc pl-5 space-y-1 mt-1">
            {global.map(k => (<li key={k.id}>{k.phrase}</li>))}
          </ul>
        </div>
        <div>
          <Label className="text-xs">Your patterns</Label>
          <ul className="text-sm space-y-1 mt-1">
            {mine.map(k => (
              <li key={k.id} className="flex items-center justify-between">
                <span>{k.phrase}</span>
                <Button variant="outline" size="sm" onClick={()=>remove(k.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Add keyword</Label>
          <div className="flex gap-2">
            <Input placeholder="e.g., 'returning on'" value={newPhrase} onChange={e=>setNewPhrase(e.target.value)} />
            <Button onClick={add}>Add</Button>
          </div>
        </div>
        <div>
          <Label className="text-xs">Deferral days</Label>
          <Input className="w-24" type="number" min={1} value={days} onChange={e=>setDays(Number(e.target.value || 7))}/>
        </div>
        <Button variant="secondary" onClick={backfill}>Backfill last 60 days</Button>
      </div>
    </Card>
  );
}



