"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface EnrichButtonProps {
  lead: {
    id: string;
  };
  onEnriched?: () => void;
}

export function EnrichButton({ lead, onEnriched }: EnrichButtonProps) {
  const [loading, setLoading] = useState(false);

  async function enrich() {
    setLoading(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Enrichment failed");
      }

      // Call callback to refresh data
      if (onEnriched) {
        onEnriched();
      }
    } catch (err) {
      console.error("Failed to enrich lead:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={enrich} disabled={loading} size="sm" variant="outline">
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Enriching…
        </>
      ) : (
        "Enrich Lead"
      )}
    </Button>
  );
}










