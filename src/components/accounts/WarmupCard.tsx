"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function WarmupCard({ accountId }: { accountId: string }) {
  const [enabled, setEnabled] = useState(true);
  const [startedAt, setStartedAt] = useState<string>("");
  const [day, setDay] = useState<number>(1);
  const [dailyCap, setDailyCap] = useState<number>(40);
  const [planId, setPlanId] = useState<string>("");
  const [remaining, setRemaining] = useState<number>(0);

  async function load() {
    const a = await fetch(`/api/accounts/${accountId}/warmup`).then(r=>r.json());
    if (a?.account) {
      setEnabled(!!a.account.warmup_enabled);
      setStartedAt(a.account.warmup_started_at || "");
      setDay(a.account.warmup_day || 1);
      setDailyCap(a.account.daily_cap || 40);
      setPlanId(a.account.plan_id || "");
    }
    const cap = await fetch(`/api/accounts/${accountId}/capacity`).then(r=>r.json());
    setRemaining(cap?.remaining ?? 0);
  }
  useEffect(()=>{ load(); }, [accountId]);

  async function save() {
    const r = await fetch(`/api/accounts/${accountId}/warmup`, {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({
        warmup_enabled: enabled,
        warmup_day: day || 1,
        warmup_started_at: startedAt || null,
        daily_cap: dailyCap,
        plan_id: planId || null
      })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Save failed");
    alert("Saved"); load();
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Warm-up Ramp</div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox checked={enabled} onCheckedChange={v=>setEnabled(Boolean(v))}/>
          <Label className="text-xs">Warm-up enabled</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Start date</Label>
          <Input className="w-40" type="date" value={startedAt || ""} onChange={e=>setStartedAt(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Manual day</Label>
          <Input className="w-24" type="number" min={1} value={day} onChange={e=>setDay(Number(e.target.value || 1))}/>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Daily cap (fallback)</Label>
          <Input className="w-24" type="number" min={1} value={dailyCap} onChange={e=>setDailyCap(Number(e.target.value || 1))}/>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Plan ID</Label>
          <Input className="w-72" placeholder="warmup_plans.id (optional)" value={planId} onChange={e=>setPlanId(e.target.value)} />
        </div>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
      <div className="text-xs text-muted-foreground">
        Remaining today: <span className="font-semibold">{remaining}</span>
      </div>
    </Card>
  );
}



