"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Mailbox = {
  id: string;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_started_at: string | null;
  warmup_plan_id: string | null;
  daily_cap: number;
};

export function WarmupCard({ accountId }: { accountId: string }) {
  const [mb, setMb] = useState<Mailbox | null>(null);
  const [plans, setPlans] = useState<{id:string;name:string}[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/mailboxes/${accountId}/warmup`);
    const j = await r.json();
    setMb(j.mailbox);
    const p = await fetch("/api/warmup/plans").then(r=>r.json()).catch(()=>({plans:[]}));
    setPlans(p.plans || []);
  }
  useEffect(()=>{ load(); }, [accountId]);

  async function save(body: any) {
    setSaving(true);
    try {
      await fetch(`/api/mailboxes/${accountId}/warmup`, {
        method:"PATCH", headers:{ "content-type":"application/json" }, body: JSON.stringify(body)
      });
      await load();
    } finally { setSaving(false); }
  }

  if (!mb) return <Card className="p-4">Loading…</Card>;

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Warmup</div>
      <div className="flex items-center gap-3">
        <Button onClick={()=>save({ warmup_enabled: !mb.warmup_enabled })} disabled={saving}>
          {mb.warmup_enabled ? "Disable warmup" : "Enable warmup"}
        </Button>
        <div className="text-xs text-muted-foreground">
          Day {mb.warmup_day} {mb.warmup_started_at ? `· since ${mb.warmup_started_at}` : ""}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <div className="text-xs mb-1">Plan</div>
          <select 
            className="w-full border rounded-md px-2 py-2 text-sm"
            value={mb.warmup_plan_id || ""}
            onChange={e=>save({ warmup_plan_id: e.target.value || null })}
            disabled={saving}
          >
            <option value="">(none)</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1">Set Day</div>
          <div className="flex gap-2">
            <Input 
              type="number" 
              min={1} 
              defaultValue={mb.warmup_day}
              onBlur={e=>save({ warmup_day: Number(e.target.value || 1) })}
              disabled={saving}
            />
            <Button 
              variant="secondary" 
              onClick={()=>save({ warmup_day: (mb.warmup_day||1)+1 })}
              disabled={saving}
            >
              +1
            </Button>
          </div>
        </div>
        <div>
          <div className="text-xs mb-1">Effective Cap (today)</div>
          <div className="text-sm">
            {/* You can show computed cap by calling a tiny API using mailbox_effective_cap */}
            ~ auto from plan
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Warmup constrains campaign caps: campaign daily cap ≤ mailbox effective cap.
      </div>
    </Card>
  );
}


