"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface VerifyNowProps {
  campaignId: string;
  leads: Array<{ id: string; email: string }>;
  onVerified?: () => void;
}

export function VerifyNow({ campaignId, leads, onVerified }: VerifyNowProps) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (leads.length === 0) {
      setMsg("No leads to verify");
      return;
    }

    setLoading(true);
    setMsg("Verifying…");

    try {
      const res = await fetch("/api/verify-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, leads }),
      });

      const out = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${out.error || "Unknown error"}`);
        setLoading(false);
        return;
      }

      setMsg(`Verified ${out.count} leads • ${JSON.stringify(out.summary)}`);
      if (onVerified) {
        onVerified();
      }
    } catch (err: any) {
      setMsg(`Error: ${err.message || "Failed to verify"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={loading || leads.length === 0} size="sm" variant="outline">
        {loading ? "Verifying…" : "Verify Now"}
      </Button>
      {msg && <span className="text-xs opacity-70">{msg}</span>}
    </div>
  );
}

