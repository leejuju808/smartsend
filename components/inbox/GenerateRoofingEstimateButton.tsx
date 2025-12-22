"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GenerateRoofingEstimateButtonProps {
  threadId: string;
  onEstimateGenerated?: (estimate: any) => void;
  disabled?: boolean;
}

/**
 * GenerateRoofingEstimateButton
 * 
 * Button component for generating roofing estimates using Block 20490 (Roofing AI Estimator v1).
 * This generates instant estimates from parsed roof scope, market rates, and insurance data.
 * 
 * Usage:
 * <GenerateRoofingEstimateButton
 *   threadId={threadId}
 *   onEstimateGenerated={(estimate) => {
 *     // Handle generated estimate
 *   }}
 * />
 */
export function GenerateRoofingEstimateButton({
  threadId,
  onEstimateGenerated,
  disabled = false,
}: GenerateRoofingEstimateButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inbox/estimates/generate-roofing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          threadId,
          triggerReason: "manual_generate"
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        
        // Handle case where scope needs to be parsed first
        if (error.requires_parsing) {
          toast.error("Please parse the roof scope first (Block 20380)");
          return;
        }
        
        throw new Error(error.error || "Failed to generate estimate");
      }

      const data = await response.json();
      
      if (data.success && data.estimate) {
        toast.success("Roofing estimate generated successfully!");
        
        if (onEstimateGenerated) {
          onEstimateGenerated(data.estimate);
        }
      } else {
        throw new Error("Failed to generate estimate");
      }
    } catch (error: any) {
      console.error("Error generating roofing estimate:", error);
      toast.error(error.message || "Failed to generate estimate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGenerate}
      disabled={loading || disabled}
      variant="default"
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating Estimate...
        </>
      ) : (
        <>
          <Calculator className="h-4 w-4" />
          Generate Roofing Estimate
        </>
      )}
    </Button>
  );
}
















































