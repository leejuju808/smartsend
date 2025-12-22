// components/campaigns/ReplyDetectionToggle.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

export function ReplyDetectionToggle({
  campaignId,
}: {
  campaignId: string;
}) {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`)
      .then(async (r) => {
        const j = await r.json();
        setEnabled(!!j.campaign?.auto_reply_detection);
      })
      .catch((err) => {
        console.error("Error fetching campaign:", err);
      });
  }, [campaignId]);

  async function save(v: boolean) {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/campaigns/${campaignId}/settings/reply-detection`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: v }),
        }
      );
      if (r.ok) {
        setEnabled(v);
      } else {
        const error = await r.json();
        console.error("Error saving setting:", error);
      }
    } catch (err) {
      console.error("Error saving setting:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm">Auto reply detection</div>
      <Button
        variant={enabled ? "default" : "outline"}
        onClick={() => save(!enabled)}
        disabled={loading}
      >
        {enabled ? "On" : "Off"}
      </Button>
    </div>
  );
}

