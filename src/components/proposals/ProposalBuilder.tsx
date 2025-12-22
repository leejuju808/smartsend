// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// Component: Proposal Builder

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

interface ProposalBuilderProps {
  leadId: string;
  workspaceId: string;
  jobDetails?: {
    job_id?: string;
    roof_type?: string;
    scope?: string;
    price?: number;
    warranty?: string;
    insurance?: boolean;
    storm_job?: boolean;
    measurements?: any;
  };
  onProposalCreated?: (proposal: any) => void;
}

export function ProposalBuilder({
  leadId,
  workspaceId,
  jobDetails,
  onProposalCreated,
}: ProposalBuilderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDetails, setCustomDetails] = useState({
    roof_type: jobDetails?.roof_type || "",
    scope: jobDetails?.scope || "",
    price: jobDetails?.price || "",
    warranty: jobDetails?.warranty || "",
  });

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proposals/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: leadId,
          workspace_id: workspaceId,
          job_details: {
            ...jobDetails,
            ...customDetails,
            price: customDetails.price ? parseFloat(customDetails.price.toString()) : undefined,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate proposal");
      }

      const data = await response.json();
      
      if (onProposalCreated) {
        onProposalCreated(data.proposal);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate proposal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 border rounded-lg">
      <div>
        <h2 className="text-2xl font-bold mb-4">AI Proposal Generator</h2>
        <p className="text-gray-600 mb-6">
          Generate a professional roofing proposal automatically using AI.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Roof Type</label>
          <Input
            value={customDetails.roof_type}
            onChange={(e) =>
              setCustomDetails({ ...customDetails, roof_type: e.target.value })
            }
            placeholder="e.g., Asphalt Shingle, Metal, TPO"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Price</label>
          <Input
            type="number"
            value={customDetails.price}
            onChange={(e) =>
              setCustomDetails({ ...customDetails, price: e.target.value })
            }
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Scope of Work</label>
        <Textarea
          value={customDetails.scope}
          onChange={(e) =>
            setCustomDetails({ ...customDetails, scope: e.target.value })
          }
          placeholder="Describe the work to be done..."
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Warranty</label>
        <Input
          value={customDetails.warranty}
          onChange={(e) =>
            setCustomDetails({ ...customDetails, warranty: e.target.value })
          }
          placeholder="e.g., 10-year workmanship, 30-year manufacturer"
        />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full"
      >
        {loading ? "Generating Proposal..." : "Generate AI Proposal"}
      </Button>
    </div>
  );
}

































