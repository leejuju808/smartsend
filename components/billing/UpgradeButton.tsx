"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export function UpgradeButton({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(false);

  const go = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to open billing portal");
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert("No portal URL returned");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error opening portal:", error);
      alert("Failed to open billing portal");
      setLoading(false);
    }
  };

  return (
    <Button onClick={go} disabled={loading}>
      {loading ? "Loading..." : "Manage Plan / Upgrade"}
    </Button>
  );
}








