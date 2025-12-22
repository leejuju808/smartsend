"use client";

// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// Block 22270 — Proposal → Job Conversion Flow v1
// Proposal Card Component
// Displays proposal information with status, intent, and revenue prediction

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle, Eye, Flame, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Proposal {
  id: string;
  lead_id: string;
  workspace_id: string;
  amount: number;
  proposal_url?: string | null;
  public_token?: string | null;
  status: "sent" | "viewed" | "considering" | "approved" | "declined" | "expired";
  sent_at: string;
  viewed_at?: string | null;
  intent?: "HOT" | "WARM" | "COLD" | "DECLINE" | null;
  confidence?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // View tracking fields (Block 22264)
  view_count?: number | null;
  total_view_seconds?: number | null;
  view_heat_score?: number | null;
  // Computed fields
  revenue_score?: number;
  estimated_revenue?: number;
  // Job conversion (Block 22270)
  job_id?: string | null;
}

interface ProposalCardProps {
  proposal: Proposal;
  onStatusChange?: (proposalId: string, newStatus: Proposal["status"]) => void;
  onJobCreated?: (proposalId: string, jobId: string) => void;
}

const statusConfig = {
  sent: { label: "Sent", color: "bg-gray-500", icon: Clock },
  viewed: { label: "Viewed", color: "bg-blue-500", icon: CheckCircle2 },
  considering: { label: "Considering", color: "bg-yellow-500", icon: AlertCircle },
  approved: { label: "Approved", color: "bg-green-500", icon: CheckCircle2 },
  declined: { label: "Declined", color: "bg-red-500", icon: XCircle },
  expired: { label: "Expired", color: "bg-gray-400", icon: Clock },
};

const intentConfig = {
  HOT: { label: "🔥 HOT", color: "bg-red-600", description: "Ready to schedule" },
  WARM: { label: "🟡 WARM", color: "bg-yellow-600", description: "Has questions" },
  COLD: { label: "❄️ COLD", color: "bg-blue-600", description: "Price too high" },
  DECLINE: { label: "❌ DECLINE", color: "bg-gray-600", description: "Not interested" },
};

export function ProposalCard({ proposal, onStatusChange, onJobCreated }: ProposalCardProps) {
  const [converting, setConverting] = useState(false);
  const statusInfo = statusConfig[proposal.status];
  const StatusIcon = statusInfo.icon;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Get public proposal URL (use public_token if available, otherwise fallback to proposal_url)
  const getProposalUrl = () => {
    if (proposal.public_token) {
      return `${typeof window !== "undefined" ? window.location.origin : ""}/p/${proposal.public_token}`;
    }
    return proposal.proposal_url;
  };

  // Calculate view heat label
  const getViewHeatLabel = () => {
    const score = proposal.view_heat_score ?? 0;
    if (isNaN(score)) return "Cold";
    if (score >= 0.75) return "🔥 Hot";
    if (score >= 0.4) return "🟡 Warm";
    return "❄️ Cold";
  };

  const proposalUrl = getProposalUrl();

  // Convert proposal to job (Block 22270)
  async function convertToJob() {
    try {
      setConverting(true);
      const res = await fetch("/api/jobs/from-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposal.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to convert proposal to job");
      }

      // Callback to update parent component
      if (onJobCreated && data.job_id) {
        onJobCreated(proposal.id, data.job_id);
      }

      // Optionally refresh the page or update local state
      // You might want to reload the proposal data here
    } catch (err: any) {
      console.error("Error converting proposal to job:", err);
      alert(err.message || "Failed to convert proposal to job");
    } finally {
      setConverting(false);
    }
  }

  return (
    <Card className="p-4 border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-lg">
            Proposal — {formatCurrency(proposal.amount)}
          </h3>
          <p className="text-sm text-gray-500">
            Sent {formatDate(proposal.sent_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {proposal.job_id && (
            <Badge className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 border-green-200">
              <Briefcase className="w-3 h-3 mr-1" />
              Job Created
            </Badge>
          )}
          <Badge className={cn("text-white", statusInfo.color)}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      {proposalUrl && (
        <a
          href={proposalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline text-sm flex items-center gap-1 mb-3"
        >
          <ExternalLink className="w-3 h-3" />
          {proposal.public_token ? "Open Proposal" : "View Proposal"}
        </a>
      )}

      {/* View Intelligence Section (Block 22264) */}
      {(proposal.view_count !== null && proposal.view_count !== undefined && proposal.view_count > 0) ||
      (proposal.total_view_seconds !== null && proposal.total_view_seconds !== undefined) ||
      (proposal.view_heat_score !== null && proposal.view_heat_score !== undefined) ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs border-t pt-3">
          <div>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Views
            </p>
            <p className="text-gray-900 font-medium">
              {proposal.view_count ?? 0}
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Read Time
            </p>
            <p className="text-gray-900 font-medium">
              {proposal.total_view_seconds
                ? Math.round(proposal.total_view_seconds / 60) + " min"
                : "–"}
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <Flame className="w-3 h-3" />
              View Heat
            </p>
            <p className="text-gray-900 font-medium">
              {getViewHeatLabel()}
              {proposal.view_heat_score !== null &&
                proposal.view_heat_score !== undefined &&
                !isNaN(proposal.view_heat_score) && (
                  <span className="text-gray-500 ml-1">
                    ({Math.round(proposal.view_heat_score * 100)}%)
                  </span>
                )}
            </p>
          </div>
        </div>
      ) : null}

      {proposal.intent && (
        <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-white text-xs", intentConfig[proposal.intent].color)}>
                {intentConfig[proposal.intent].label}
              </Badge>
              {proposal.confidence !== null && proposal.confidence !== undefined && (
                <span className="text-xs text-gray-600">
                  {(proposal.confidence * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2">
            {intentConfig[proposal.intent].description}
          </p>
          {proposal.estimated_revenue !== undefined && proposal.estimated_revenue !== null && (
            <div className="flex items-center gap-1 text-sm font-medium text-green-700">
              <TrendingUp className="w-4 h-4" />
              Estimated Revenue: {formatCurrency(proposal.estimated_revenue)}
            </div>
          )}
        </div>
      )}

      {proposal.viewed_at && (
        <p className="text-xs text-gray-500 mt-2">
          Viewed {formatDate(proposal.viewed_at)}
        </p>
      )}

      {proposal.notes && (
        <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-700">
          <p className="font-medium mb-1">Notes:</p>
          <p>{proposal.notes}</p>
        </div>
      )}

      {/* Convert to Job button (Block 22270) */}
      {proposal.status === "approved" && !proposal.job_id && (
        <div className="mt-4 pt-3 border-t">
          <Button
            onClick={convertToJob}
            disabled={converting}
            className="w-full bg-black text-white hover:bg-gray-800"
          >
            {converting ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Converting…
              </>
            ) : (
              <>
                <Briefcase className="w-4 h-4 mr-2" />
                Convert to Job
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}

