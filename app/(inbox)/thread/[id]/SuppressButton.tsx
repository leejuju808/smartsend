"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SuppressButton({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={loading}
      onClick={async () => {
        try {
          setLoading(true);
          await fetch("/api/suppress", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lead_id: leadId, reason: "manual" }),
          });
          window.location.reload();
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Suppressing..." : "Respect & Suppress"}
    </Button>
  );
}

