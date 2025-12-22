'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import BudgetCard from "@/components/ai/BudgetCard";

export default function AIControl() {
  const [status, setStatus] = useState<any>({});
  const [canaryTag, setCanaryTag] = useState("");

  const refresh = async () => {
    const r = await fetch("/api/ai/routing/status");
    const j = await r.json();
    setStatus(j);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startTrain = async () => {
    const r = await fetch("/api/ai/train/start", { method: "POST", body: JSON.stringify({ size: 3000, min_conf: 0.7 }) });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error || "train failed");
    toast.success(`Training submitted (${j.training_job_id})`);
  };

  const pollTrain = async () => {
    const { training_job_id } = status;
    const r = await fetch("/api/ai/train/status", { method: "POST", body: JSON.stringify({ job_id: training_job_id }) });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error || "status failed");
    toast.success("Status updated");
    refresh();
  };

  const setCanary = async () => {
    const r = await fetch("/api/ai/routing/canary", { method: "POST", body: JSON.stringify({ version_tag: canaryTag, weight: 10 }) });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error);
    toast.success("Canary set to 10%");
    refresh();
  };

  const promoteIfBetter = async () => {
    const r = await fetch("/api/ai/promote-if-better", { method: "POST" });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error || "not promoted");
    toast.success(`Promoted ${j.promoted}`);
    refresh();
  };

  const rollback = async () => {
    const r = await fetch("/api/ai/routing/rollback", { method: "POST" });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error);
    toast.success("Rolled back canary to 0%");
    refresh();
  };

  return (
    <div className="p-6 grid gap-6">
      <BudgetCard />

      <Card>
        <CardHeader>
          <CardTitle>Retrain</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button onClick={startTrain}>Start Training (3k balanced)</Button>
          <Button variant="secondary" onClick={pollTrain}>Poll Training Status</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Traffic Routing</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input placeholder="canary version tag (e.g., v1.1.0)" value={canaryTag} onChange={(e) => setCanaryTag(e.target.value)} />
          <Button onClick={setCanary}>Set 10% Canary</Button>
          <Button variant="secondary" onClick={promoteIfBetter}>Promote If Better (+2% acc, n≥300)</Button>
          <Button variant="destructive" onClick={rollback}>Rollback (0%)</Button>
        </CardContent>
      </Card>
    </div>
  );
}

