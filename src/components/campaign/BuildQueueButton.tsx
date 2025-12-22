"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BuildQueueButton({ campaignId, defaultDate = "today" }:{
  campaignId: string; defaultDate?: "today"|"tomorrow";
}) {
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const d = new Date();
      if (defaultDate === "tomorrow") d.setDate(d.getDate()+1);
      const date = d.toISOString().slice(0,10);
      const r = await fetch(`/api/campaigns/${campaignId}/queue/build?date=${date}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) alert(j.error || "Build failed");
      else {
        const s = j.summary;
        alert(`Queue: +${s?.inserted||0} (skipped ${s?.skipped_existing||0})  ·  Window ${s?.window_start||"—"} → ${s?.window_end||"—"}`);
      }
    } finally { setLoading(false); }
  }
  return (
    <Button onClick={run} disabled={loading}>
      {loading ? "Building…" : `Build Queue (${defaultDate})`}
    </Button>
  );
}



