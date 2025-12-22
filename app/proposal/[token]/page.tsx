// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Homeowner-facing proposal view page
// Accessible via public token

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProposalSignature } from "./components/ProposalSignature";
import { ProposalUpsells } from "./components/ProposalUpsells";
import { ProposalPriceTable } from "./components/ProposalPriceTable";

type Proposal = {
  id: string;
  proposal_data: any;
  total_price: number;
  upsells: any[];
  signature: any;
  signed_at: string | null;
  status: string;
  contractor: {
    company_name?: string;
    email?: string;
  };
};

export default function ProposalViewPage() {
  const params = useParams();
  const token = params.token as string;
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUpsells, setSelectedUpsells] = useState<any[]>([]);

  useEffect(() => {
    loadProposal();
  }, [token]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/view/${token}`);
      if (!response.ok) throw new Error("Failed to load proposal");
      const data = await response.json();
      setProposal(data.proposal);
      setSelectedUpsells(data.proposal?.upsells || []);
    } catch (error) {
      console.error("Error loading proposal:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async () => {
    // Track view
    if (proposal) {
      await fetch(`/api/proposals/${proposal.id}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "viewed",
          device: navigator.userAgent.includes("Mobile") ? "mobile" : "desktop",
        }),
      });
    }
  };

  useEffect(() => {
    if (proposal && !proposal.viewed_at) {
      handleView();
    }
  }, [proposal]);

  const handleUpsellToggle = (upsell: any) => {
    const isSelected = selectedUpsells.some((u) => u.id === upsell.id);
    if (isSelected) {
      setSelectedUpsells(selectedUpsells.filter((u) => u.id !== upsell.id));
    } else {
      setSelectedUpsells([...selectedUpsells, upsell]);
    }
  };

  const handleSignature = async (signature: any) => {
    if (!proposal) return;

    try {
      const response = await fetch(`/api/proposals/${proposal.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          final_price: calculateTotal(),
          upsells: selectedUpsells,
        }),
      });

      if (!response.ok) throw new Error("Failed to sign proposal");

      const data = await response.json();
      setProposal(data.proposal);
    } catch (error) {
      console.error("Error signing proposal:", error);
      alert("Failed to sign proposal. Please try again.");
    }
  };

  const calculateTotal = () => {
    if (!proposal) return 0;
    const basePrice = proposal.total_price || 0;
    const upsellTotal = selectedUpsells.reduce((sum, upsell) => sum + (upsell.price || 0), 0);
    return basePrice + upsellTotal;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">Proposal not found or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const aiContent = proposal.proposal_data?.ai_generated_content || {};
  const isSigned = proposal.status === "signed" || proposal.signed_at !== null;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Your Roofing Proposal</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  {proposal.contractor?.company_name || "Your Contractor"}
                </p>
              </div>
              <Badge variant={isSigned ? "default" : "secondary"}>
                {isSigned ? "Signed" : proposal.status}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Scope of Work */}
        {aiContent.scope_of_work && (
          <Card>
            <CardHeader>
              <CardTitle>Scope of Work</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <p className="whitespace-pre-line">{aiContent.scope_of_work}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Materials */}
        {aiContent.materials_list && (
          <Card>
            <CardHeader>
              <CardTitle>Materials</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <p className="whitespace-pre-line">{aiContent.materials_list}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pricing Table */}
        <ProposalPriceTable proposalId={proposal.id} />

        {/* Optional Upgrades */}
        <ProposalUpsells
          proposalId={proposal.id}
          selectedUpsells={selectedUpsells}
          onToggle={handleUpsellToggle}
        />

        {/* Warranty */}
        {aiContent.warranty_explanation && (
          <Card>
            <CardHeader>
              <CardTitle>Warranty</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <p className="whitespace-pre-line">{aiContent.warranty_explanation}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        {aiContent.timeline && (
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <p className="whitespace-pre-line">{aiContent.timeline}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Final Summary */}
        {aiContent.final_summary && (
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <p className="whitespace-pre-line">{aiContent.final_summary}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Total Price */}
        <Card className="bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Price</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${calculateTotal().toLocaleString()}
                </p>
                {selectedUpsells.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Includes {selectedUpsells.length} upgrade{selectedUpsells.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signature Area */}
        {!isSigned && (
          <Card>
            <CardHeader>
              <CardTitle>Sign Proposal</CardTitle>
            </CardHeader>
            <CardContent>
              <ProposalSignature onSign={handleSignature} />
            </CardContent>
          </Card>
        )}

        {/* Signed Confirmation */}
        {isSigned && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-green-700 font-semibold mb-2">✓ Proposal Signed</p>
                <p className="text-sm text-gray-600">
                  Signed on {new Date(proposal.signed_at || "").toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Download PDF */}
        <div className="text-center">
          <Button variant="outline" onClick={() => window.print()}>
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
