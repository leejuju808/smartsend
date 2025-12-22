// Block 20710 — Insurance Brain Panel (from Block 20360)

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Shield, DollarSign, CheckCircle2, XCircle, Mail } from "lucide-react";
import { format } from "date-fns";

interface InsuranceBrainPanelProps {
  data: {
    carrier: string | null;
    claimStatus: string | null;
    deductible: number | null;
    deductibleType: string | null;
    payoutType: string | null;
    depreciationRecoverable: boolean;
    depreciationAmount: number | null;
    claimFiledDate: string | null;
    approvalDate: string | null;
    adjusterName: string | null;
    adjusterEmail: string | null;
    installReady: boolean;
    rcv: number | null;
    acv: number | null;
  };
}

export function InsuranceBrainPanel({ data }: InsuranceBrainPanelProps) {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatClaimStatus = (status: string | null) => {
    if (!status) return "Unknown";
    const statusMap: Record<string, string> = {
      no_claim_filed: "No Claim Filed",
      claim_filed_awaiting_adjuster: "Claim Filed — Awaiting Adjuster",
      adjuster_visit_scheduled: "Adjuster Visit Scheduled",
      under_review: "Under Review",
      approved: "Approved (RCV)",
      approved_acv_only: "Approved (ACV Only)",
      supplements_needed: "Supplements Needed",
      denied: "Denied",
    };
    return statusMap[status] || status.replace(/_/g, " ");
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-700";
    if (status === "approved") return "bg-green-100 text-green-700 border-green-300";
    if (status === "approved_acv_only") return "bg-yellow-100 text-yellow-700 border-yellow-300";
    if (status === "denied") return "bg-red-100 text-red-700 border-red-300";
    if (status.includes("awaiting") || status.includes("scheduled")) return "bg-blue-100 text-blue-700 border-blue-300";
    return "bg-gray-100 text-gray-700";
  };

  if (!data.carrier && !data.claimStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Insurance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No insurance information available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Insurance Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Claim Status */}
        {data.claimStatus && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Claim Status</span>
              <Badge className={getStatusColor(data.claimStatus)}>
                {formatClaimStatus(data.claimStatus)}
              </Badge>
            </div>
          </div>
        )}

        {/* RCV/ACV */}
        {data.rcv && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">RCV Approved</span>
              <span className="text-lg font-bold text-green-700">
                {formatCurrency(data.rcv)}
              </span>
            </div>
          </div>
        )}

        {data.acv && !data.rcv && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ACV Approved</span>
              <span className="text-lg font-bold text-yellow-700">
                {formatCurrency(data.acv)}
              </span>
            </div>
          </div>
        )}

        {/* Deductible */}
        {data.deductible && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Deductible</span>
              <span className="font-medium">
                {formatCurrency(data.deductible)}
                {data.deductibleType === "percentage" && " (percentage)"}
              </span>
            </div>
          </div>
        )}

        {/* Depreciation */}
        {data.depreciationRecoverable && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              Depreciation: Recoverable
              {data.depreciationAmount && ` (${formatCurrency(data.depreciationAmount)})`}
            </span>
          </div>
        )}

        {/* Payout Type */}
        {data.payoutType && (
          <div className="text-sm">
            <span className="text-muted-foreground">Payout Type: </span>
            <span className="font-medium">{data.payoutType}</span>
          </div>
        )}

        {/* Dates */}
        {data.claimFiledDate && (
          <div className="text-sm pt-2 border-t">
            <span className="text-muted-foreground">Claim Filed: </span>
            <span>{format(new Date(data.claimFiledDate), "MMM d, yyyy")}</span>
          </div>
        )}

        {data.approvalDate && (
          <div className="text-sm">
            <span className="text-muted-foreground">Approved: </span>
            <span>{format(new Date(data.approvalDate), "MMM d, yyyy")}</span>
          </div>
        )}

        {/* Adjuster Info */}
        {data.adjusterName && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">{data.adjusterName}</div>
                {data.adjusterEmail && (
                  <div className="text-xs text-muted-foreground">{data.adjusterEmail}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Install Ready Badge */}
        {data.installReady && (
          <div className="pt-2">
            <Badge className="bg-green-100 text-green-700 border-green-300">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Install Ready
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































