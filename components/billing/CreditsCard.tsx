"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function CreditsCard({
  credits,
  workspaceId,
}: {
  credits: number;
  workspaceId?: string;
}) {
  const [loading, setLoading] = useState(false);

  const buyCredits = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      // Open billing portal where users can buy credits
      const portalRes = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (portalRes.ok) {
        const portalJson = await portalRes.json();
        if (portalJson.url) {
          window.location.href = portalJson.url;
        } else {
          alert("Failed to open billing portal");
        }
      } else {
        const error = await portalRes.json();
        alert(error.error || "Failed to open billing portal");
      }
    } catch (error) {
      console.error("Error buying credits:", error);
      alert("Failed to open billing portal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-4">{credits}</div>
        {workspaceId && (
          <Button
            onClick={buyCredits}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? "Loading..." : "Buy Credits"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

