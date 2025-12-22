"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GenerateEstimateButtonProps {
  threadId: string;
  onEstimateGenerated?: (estimate: any) => void;
}

export function GenerateEstimateButton({
  threadId,
  onEstimateGenerated,
}: GenerateEstimateButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inbox/estimates/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ threadId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate estimate");
      }

      const data = await response.json();
      toast.success("Estimate generated successfully!");
      
      if (onEstimateGenerated) {
        onEstimateGenerated(data.estimate);
      }
    } catch (error: any) {
      console.error("Error generating estimate:", error);
      toast.error(error.message || "Failed to generate estimate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGenerate}
      disabled={loading}
      variant="outline"
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileText className="h-4 w-4" />
          Generate AI Estimate
        </>
      )}
    </Button>
  );
}



















































