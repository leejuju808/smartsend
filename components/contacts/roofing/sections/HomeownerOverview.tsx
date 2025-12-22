// Block 20710 — Homeowner Overview (Top Bar)

"use client";

import { Badge } from "@/components/ui/badge";
import { Flame, MapPin, Shield, Phone, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface HomeownerOverviewProps {
  data: {
    name: string;
    address: string;
    carrier: string | null;
    claimNumber: string | null;
    currentStage: string;
    hotLeadScore: number | null;
    hotLeadTier: string | null;
    phone: string | null;
    email: string;
    lastActivity: Date | null;
    lastActivityType: string | null;
  };
}

export function HomeownerOverview({ data }: HomeownerOverviewProps) {
  const formatStage = (stage: string) => {
    const stageMap: Record<string, string> = {
      NEW_LEAD: "New Lead",
      INSTALL_READY: "Install Ready",
      APPROVED: "Approved",
      AWAITING_ADJUSTER: "Awaiting Adjuster",
      ADJUSTER_VISIT_SCHEDULED: "Adjuster Visit Scheduled",
      UNDER_REVIEW: "Under Review",
      APPROVED_ACV_ONLY: "Approved (ACV Only)",
      SUPPLEMENTS_NEEDED: "Supplements Needed",
      DENIED: "Denied",
      SCHEDULED: "Scheduled",
      COMPLETED: "Completed",
    };
    return stageMap[stage] || stage.replace(/_/g, " ");
  };

  const getHotLeadColor = (score: number | null) => {
    if (!score) return "bg-gray-100 text-gray-700";
    if (score >= 80) return "bg-red-100 text-red-700 border-red-300";
    if (score >= 60) return "bg-orange-100 text-orange-700 border-orange-300";
    return "bg-yellow-100 text-yellow-700 border-yellow-300";
  };

  return (
    <div className="space-y-3">
      {/* Name and Address */}
      <div>
        <h2 className="text-2xl font-bold">{data.name}</h2>
        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>{data.address || "No address"}</span>
        </div>
      </div>

      {/* Insurance Info */}
      <div className="flex items-center gap-3 flex-wrap">
        {data.carrier && (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="font-medium">{data.carrier}</span>
            {data.claimNumber && (
              <span className="text-sm text-muted-foreground">
                · Claim #{data.claimNumber}
              </span>
            )}
          </div>
        )}

        {/* Hot Lead Score */}
        {data.hotLeadScore !== null && (
          <Badge
            className={`flex items-center gap-1 ${getHotLeadColor(data.hotLeadScore)}`}
          >
            <Flame className="h-3 w-3" />
            Hot Lead — Score {data.hotLeadScore}
          </Badge>
        )}

        {/* Current Stage */}
        <Badge variant="outline" className="font-medium">
          Stage: {formatStage(data.currentStage)}
        </Badge>
      </div>

      {/* Contact Info and Last Activity */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {data.phone && (
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            <span>{data.phone}</span>
          </div>
        )}
        {data.email && (
          <div className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            <span>{data.email}</span>
          </div>
        )}
        {data.lastActivity && (
          <div className="ml-auto">
            Last Activity: {data.lastActivityType || "Activity"}{" "}
            {formatDistanceToNow(new Date(data.lastActivity), { addSuffix: true })}
          </div>
        )}
      </div>
    </div>
  );
}
















































