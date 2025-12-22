"use client";

// Block 200000 — Insurance Claim Tracker Component

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, Clock, XCircle } from "lucide-react";

type InsuranceClaim = {
  claim_number: string | null;
  carrier_name: string | null;
  claim_status: string | null;
  deductible: number | null;
  acv_amount: number | null;
  rcv_amount: number | null;
  depreciation_amount: number | null;
  acv_paid: number | null;
  rcv_paid: number | null;
  supplement_requested: number | null;
  supplement_approved: number | null;
};

export function InsuranceTracker({ claim }: { claim: InsuranceClaim | null }) {
  if (!claim || !claim.claim_number) {
    return null;
  }

  const getStatusIcon = () => {
    switch (claim.claim_status) {
      case "complete":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "awaiting_rcv":
      case "awaiting_acv":
      case "awaiting_supplement":
        return <Clock className="h-5 w-5 text-orange-500" />;
      case "denied":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    const status = claim.claim_status || "not_started";
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      complete: { label: "Complete", variant: "default" },
      awaiting_acv: { label: "Awaiting ACV", variant: "secondary" },
      awaiting_rcv: { label: "Awaiting RCV", variant: "secondary" },
      awaiting_supplement: { label: "Awaiting Supplement", variant: "secondary" },
      denied: { label: "Denied", variant: "destructive" },
      in_progress: { label: "In Progress", variant: "outline" },
    };

    const statusInfo = statusMap[status] || { label: status, variant: "outline" as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Insurance Claim Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Claim Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Claim Number</p>
            <p className="font-semibold">{claim.claim_number}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Carrier</p>
            <p className="font-semibold">{claim.carrier_name || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <div className="flex items-center gap-2 mt-1">
              {getStatusIcon()}
              {getStatusBadge()}
            </div>
          </div>
          {claim.deductible && (
            <div>
              <p className="text-sm text-gray-600">Deductible</p>
              <p className="font-semibold">${claim.deductible.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Financial Breakdown */}
        {(claim.rcv_amount || claim.acv_amount) && (
          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3">Financial Breakdown</h4>
            <div className="space-y-2 text-sm">
              {claim.rcv_amount && (
                <div className="flex justify-between">
                  <span className="text-gray-600">RCV (Replacement Cost Value)</span>
                  <span className="font-semibold">${claim.rcv_amount.toLocaleString()}</span>
                </div>
              )}
              {claim.acv_amount && (
                <div className="flex justify-between">
                  <span className="text-gray-600">ACV (Actual Cash Value)</span>
                  <span className="font-semibold">${claim.acv_amount.toLocaleString()}</span>
                </div>
              )}
              {claim.depreciation_amount && (
                <div className="flex justify-between text-gray-600">
                  <span>Depreciation</span>
                  <span>${claim.depreciation_amount.toLocaleString()}</span>
                </div>
              )}
              {claim.acv_paid && claim.acv_paid > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>ACV Paid</span>
                  <span className="font-semibold">${claim.acv_paid.toLocaleString()}</span>
                </div>
              )}
              {claim.rcv_paid && claim.rcv_paid > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>RCV Paid</span>
                  <span className="font-semibold">${claim.rcv_paid.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Supplements */}
        {(claim.supplement_requested || claim.supplement_approved) && (
          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3">Supplements</h4>
            <div className="space-y-2 text-sm">
              {claim.supplement_requested && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Supplement Requested</span>
                  <span className="font-semibold">${claim.supplement_requested.toLocaleString()}</span>
                </div>
              )}
              {claim.supplement_approved && (
                <div className="flex justify-between text-green-600">
                  <span>Supplement Approved</span>
                  <span className="font-semibold">${claim.supplement_approved.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


























