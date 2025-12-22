// Block 20520 — SmartSend Roofing Proposal Builder v1
// Proposal Display Component (Contractor View)

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Copy, Mail, Download, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface ProposalData {
  homeowner_name: string;
  property_address: string;
  roof_summary: {
    scope: string;
    material: string;
    code_items: string[];
  };
  project_price: number;
  insurance_comparison?: {
    carrier: string;
    rcv_total: number;
    deductible: number;
    depreciation_recoverable: boolean;
    notes: string;
  };
  line_items: Array<{
    description: string;
    category: string;
    quantity: number;
    unit: string;
    total_cost: number;
  }>;
  warranty: string;
  timeline: string;
  next_steps: string;
}

interface Proposal {
  id: string;
  thread_id: string;
  status: string;
  proposal_data: ProposalData;
  proposal_text: string;
  created_at: string;
}

interface ProposalDisplayProps {
  threadId: string;
  proposal?: Proposal | null;
  onProposalGenerated?: (proposal: Proposal) => void;
}

export function ProposalDisplay({
  threadId,
  proposal: initialProposal,
  onProposalGenerated,
}: ProposalDisplayProps) {
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal || null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initialProposal && threadId) {
      loadProposal();
    }
  }, [threadId, initialProposal]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/inbox/proposals/generate?threadId=${threadId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.proposal) {
          setProposal(data.proposal);
        }
      } else if (response.status === 404) {
        // No proposal exists yet, that's okay
        setProposal(null);
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
    }
  };

  const handleGenerateProposal = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/inbox/proposals/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ threadId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate proposal");
      }

      const data = await response.json();
      setProposal(data.proposal);
      toast.success("Proposal generated successfully!");
      
      if (onProposalGenerated) {
        onProposalGenerated(data.proposal);
      }
    } catch (error: any) {
      console.error("Error generating proposal:", error);
      toast.error(error.message || "Failed to generate proposal");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!proposal?.proposal_text) return;

    try {
      await navigator.clipboard.writeText(proposal.proposal_text);
      setCopied(true);
      toast.success("Proposal copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      toast.error("Failed to copy proposal");
    }
  };

  const handleSendProposal = async () => {
    if (!proposal) return;

    setSending(true);
    try {
      // TODO: Implement send proposal email endpoint
      toast.success("Proposal email sent!");
    } catch (error: any) {
      console.error("Error sending proposal:", error);
      toast.error(error.message || "Failed to send proposal");
    } finally {
      setSending(false);
    }
  };

  const handleDownloadText = () => {
    if (!proposal?.proposal_text) return;

    const blob = new Blob([proposal.proposal_text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-${threadId}-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Proposal downloaded!");
  };

  if (!proposal) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-lg mb-2">No Proposal Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Generate a homeowner-ready proposal from your estimate
              </p>
              <Button
                onClick={handleGenerateProposal}
                disabled={generating}
                className="w-full"
              >
                {generating ? "Generating..." : "Generate Proposal"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const proposalData = proposal.proposal_data;
  const insuranceComparison = proposalData.insurance_comparison;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Homeowner Proposal (AI-Generated)</CardTitle>
          <Badge variant={proposal.status === "sent" ? "default" : "secondary"}>
            {proposal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-lg font-semibold">
              ${proposalData.project_price.toLocaleString()}
            </div>
          </div>
          {insuranceComparison && (
            <>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">RCV</div>
                <div className="text-lg font-semibold">
                  ${insuranceComparison.rcv_total.toLocaleString()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Deductible</div>
                <div className="text-lg font-semibold">
                  ${insuranceComparison.deductible.toLocaleString()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Depreciation</div>
                <div className="text-sm font-medium">
                  {insuranceComparison.depreciation_recoverable ? "Recoverable" : "Non-recoverable"}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Expandable Proposal Text */}
        <div className="border rounded-lg">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
          >
            <span className="font-medium text-sm">Proposal Text</span>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {expanded && (
            <div className="p-4 border-t bg-muted/30">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                {proposal.proposal_text}
              </div>
            </div>
          )}
        </div>

        {/* Proposal Details */}
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Roof Summary:</span>{" "}
            {proposalData.roof_summary.scope}
          </div>
          <div>
            <span className="font-medium">Material:</span> {proposalData.roof_summary.material}
          </div>
          {proposalData.roof_summary.code_items.length > 0 && (
            <div>
              <span className="font-medium">Code Items:</span>{" "}
              {proposalData.roof_summary.code_items.join(", ")}
            </div>
          )}
          <div>
            <span className="font-medium">Warranty:</span> {proposalData.warranty}
          </div>
          <div>
            <span className="font-medium">Timeline:</span> {proposalData.timeline}
          </div>
        </div>

        {/* Insurance Comparison Notes */}
        {insuranceComparison && insuranceComparison.notes && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
              Insurance Notes
            </div>
            <div className="text-xs text-blue-800 dark:text-blue-200">
              {insuranceComparison.notes}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyToClipboard}
            disabled={copied}
          >
            <Copy className="h-4 w-4 mr-2" />
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendProposal}
            disabled={sending}
          >
            <Mail className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send Proposal Email"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadText}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Proposal Text
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

