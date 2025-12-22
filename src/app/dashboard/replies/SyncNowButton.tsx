"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SyncNowButton() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await fetch("/api/sync/gmail", { method: "POST" });
          const j = await r.json();
          alert(j.ok ? "Synced." : `Error: ${j.error || "failed"}`);
        } finally { 
          setLoading(false); 
        }
      }}
    >
      {loading ? "Syncing…" : "Sync Now"}
    </Button>
  );
}

