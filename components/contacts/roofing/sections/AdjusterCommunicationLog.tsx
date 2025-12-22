// Block 20710 — Adjuster Communication Log (from Block 20590)

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Mail, AlertCircle, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface AdjusterCommunicationLogProps {
  communications: Array<{
    id: string;
    type: string;
    subject: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
    triggerReason: string | null;
    missingItems: any[];
    supplementValue: number | null;
  }>;
}

export function AdjusterCommunicationLog({
  communications,
}: AdjusterCommunicationLogProps) {
  const formatEmailType = (type: string) => {
    const typeMap: Record<string, string> = {
      supplement_request: "Supplement Request",
      approval_nudge: "Approval Nudge",
      pricing_dispute: "Pricing Dispute",
      missing_items_dispute: "Missing Items Dispute",
      documentation_upload: "Documentation Upload",
      general_follow_up: "General Follow-Up",
    };
    return typeMap[type] || type.replace(/_/g, " ");
  };

  const getStatusColor = (status: string) => {
    if (status === "sent") return "bg-green-100 text-green-700 border-green-300";
    if (status === "failed") return "bg-red-100 text-red-700 border-red-300";
    if (status === "queued") return "bg-yellow-100 text-yellow-700 border-yellow-300";
    return "bg-gray-100 text-gray-700";
  };

  if (!communications || communications.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Adjuster Communications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {communications.map((comm) => (
            <div key={comm.id} className="border-b last:border-0 pb-4 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{formatEmailType(comm.type)}</span>
                    <Badge className={getStatusColor(comm.status)}>{comm.status}</Badge>
                  </div>
                  {comm.subject && (
                    <div className="text-sm text-muted-foreground">{comm.subject}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {comm.sentAt
                    ? format(new Date(comm.sentAt), "MMM d, yyyy")
                    : format(new Date(comm.createdAt), "MMM d, yyyy")}
                </div>
              </div>

              {/* Trigger Reason */}
              {comm.triggerReason && (
                <div className="text-xs text-muted-foreground mb-2">
                  Trigger: {comm.triggerReason.replace(/_/g, " ")}
                </div>
              )}

              {/* Missing Items */}
              {comm.missingItems && comm.missingItems.length > 0 && (
                <div className="flex items-start gap-2 mt-2">
                  <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-orange-700">Missing Items:</div>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {comm.missingItems.map((item: any, idx: number) => (
                        <li key={idx}>
                          {typeof item === "string" ? item : item.name || item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Supplement Value */}
              {comm.supplementValue && comm.supplementValue > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    Supplement Value: ${comm.supplementValue.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
















































