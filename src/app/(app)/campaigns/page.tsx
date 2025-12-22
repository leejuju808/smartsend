"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function CampaignsIndex() {
  const { data, mutate } = useSWR("/api/campaigns", fetcher);
  const [name, setName] = useState("");

  async function createCampaign() {
    const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return alert("Create failed");
    setName("");
    mutate();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 text-sm" placeholder="New campaign name" value={name} onChange={e => setName(e.target.value)} />
        <Button onClick={createCampaign}>Create</Button>
      </div>
      <ul className="list-disc pl-6">
        {(data?.campaigns ?? []).map((c: any) => (
          <li key={c.id}>
            <Link href={`/campaigns/${c.id}`} className="underline">{c.name}</Link>
            <span className="text-sm text-muted-foreground ml-2">({new Date(c.created_at).toLocaleDateString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}