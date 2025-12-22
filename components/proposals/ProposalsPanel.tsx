"use client";

// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// Proposals Panel Component
// Displays all proposals for a lead with ability to add new ones

import { useEffect, useState } from "react";
import { ProposalCard, Proposal } from "./ProposalCard";
import { AddProposalForm } from "./AddProposalForm";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ProposalsPanelProps {
  leadId: string;
  workspaceId: string;
}

export function ProposalsPanel({ leadId, workspaceId }: ProposalsPanelProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProposals = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/proposals/${leadId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch proposals");
      }
      const data = await response.json();
      setProposals(data.proposals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proposals");
      console.error("Error fetching proposals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [leadId]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading proposals...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-destructive">
          <p>Error loading proposals: {error}</p>
          <button
            onClick={fetchProposals}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  // Calculate total estimated revenue
  const totalEstimatedRevenue = proposals.reduce((sum, p) => {
    return sum + (p.estimated_revenue || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      {proposals.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Proposals</p>
              <p className="text-2xl font-bold text-gray-900">{proposals.length}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Estimated Revenue</p>
              <p className="text-2xl font-bold text-green-700">
                ${totalEstimatedRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Add Proposal Form */}
      <AddProposalForm
        lead_id={leadId}
        workspace_id={workspaceId}
        onProposalAdded={fetchProposals}
      />

      {/* Proposals List */}
      {proposals.length === 0 ? (
        <Card className="p-6">
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">No proposals yet</p>
            <p className="text-sm mt-2">
              Add a proposal above to start tracking homeowner responses
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}








































