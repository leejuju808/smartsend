"use client";

import useSWR from "swr";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PoolManager({ accountId }: { accountId: string }) {
  const { data: pools, mutate } = useSWR(`/api/routing/pools?accountId=${accountId}`, (url) =>
    fetch(url).then((res) => res.json()),
  );
  const [name, setName] = useState("");

  const create = async () => {
    if (!name.trim()) {
      toast.error("Pool name required");
      return;
    }

    const response = await fetch("/api/routing/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, name }),
    });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error ?? "Failed to create pool");
      return;
    }

    toast.success("Created");
    setName("");
    mutate();
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Owner Pools</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Pool name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button onClick={create}>Create</Button>
        </div>
        <div className="grid gap-2">
          {(pools ?? []).map((pool: any) => (
            <div key={pool.id} className="rounded-xl border p-2 text-sm">
              <div className="font-medium">{pool.name}</div>
              <div className="text-xs text-muted-foreground">
                {pool.member_count} members • {String(pool.account_id).slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


