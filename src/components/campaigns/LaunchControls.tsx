"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/hooks/useRole";

export function LaunchControls({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const role = useRole(campaignId);
  const disabled = role !== "owner" || loading;

  async function launch() {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/launch`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Launch failed");
      } else {
        alert("Launched!");
      }
    } catch (error) {
      console.error("Launch error:", error);
      alert("Launch failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button disabled={disabled} onClick={launch}>
        {role !== "owner" ? "Owner can Launch" : loading ? "Launching..." : "Launch"}
      </Button>
    </div>
  );
}



