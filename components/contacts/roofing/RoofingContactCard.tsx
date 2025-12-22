// Block 20710 — SmartSend Roofing Contact Card v1
// The Ultimate Single-View Homeowner Profile

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { HomeownerOverview } from "./sections/HomeownerOverview";
import { InsuranceBrainPanel } from "./sections/InsuranceBrainPanel";
import { ScopePanel } from "./sections/ScopePanel";
import { EstimatePricingPanel } from "./sections/EstimatePricingPanel";
import { ProposalPanel } from "./sections/ProposalPanel";
import { AdjusterCommunicationLog } from "./sections/AdjusterCommunicationLog";
import { ClaimJourneyTimeline } from "./sections/ClaimJourneyTimeline";
import { ActivityFeed } from "./sections/ActivityFeed";
import { PhoneScriptEngine } from "./sections/PhoneScriptEngine";
import { PriceObjectionBrainPanel } from "./sections/PriceObjectionBrainPanel";
import { RevenueForecastPanel } from "./sections/RevenueForecastPanel";
import { NextBestActionPanel } from "./sections/NextBestActionPanel";
import {
  Phone,
  Mail,
  MessageSquare,
  FileText,
  Edit,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

interface RoofingContactCardProps {
  contactId: string;
  onActionComplete?: () => void;
}

export function RoofingContactCard({
  contactId,
  onActionComplete,
}: RoofingContactCardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contacts/${contactId}/roofing-card`);
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error ?? "Failed to load contact card");
          setData(null);
        } else {
          setData(json);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contact card");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [contactId]);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCall = () => {
    if (data?.contact?.phone) {
      window.location.href = `tel:${data.contact.phone}`;
    }
  };

  const handleSendProposal = () => {
    // TODO: Implement proposal sending
    console.log("Send proposal clicked");
  };

  const handleMessageAdjuster = () => {
    // TODO: Implement adjuster messaging
    console.log("Message adjuster clicked");
  };

  const handleUpdateStage = () => {
    // TODO: Implement stage update
    console.log("Update stage clicked");
  };

  const handleAddNote = () => {
    // TODO: Implement note adding
    console.log("Add note clicked");
  };

  const handleOpenThread = () => {
    if (data?.homeownerOverview?.email) {
      window.open(`/inbox?email=${encodeURIComponent(data.homeownerOverview.email)}`, "_blank");
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <Skeleton className="h-8 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">{error || "Failed to load contact card"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-2">
      {/* Top Bar - Homeowner Overview */}
      <CardHeader className="border-b pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <HomeownerOverview data={data.homeownerOverview} />
          </div>
          <div className="flex items-center gap-2 ml-4">
            {/* Action Buttons */}
            {data.contact.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCall}
                className="flex items-center gap-2"
              >
                <Phone className="h-4 w-4" />
                Call
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendProposal}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Send Proposal
            </Button>
            {data.insuranceBrain.adjusterEmail && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMessageAdjuster}
                className="flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Message Adjuster
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpdateStage}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Update Stage
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddNote}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Add Note
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenThread}
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open Thread
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Next Best Action Panel - Prominently displayed at top */}
        {data?.homeownerOverview?.threadId && (
          <NextBestActionPanel
            threadId={data.homeownerOverview.threadId}
            onActionComplete={() => {
              // Reload data when action is completed
              if (onActionComplete) {
                onActionComplete();
              }
            }}
          />
        )}

        {/* Revenue Forecast Panel (Block 21260) - Full Width */}
        {data.revenueForecast && (
          <RevenueForecastPanel
            data={data.revenueForecast}
            contactId={contactId}
            onRecalculate={() => {
              // Reload data
              if (onActionComplete) {
                onActionComplete();
              }
            }}
          />
        )}

        {/* Main Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Insurance Brain Panel */}
          <InsuranceBrainPanel data={data.insuranceBrain} />

          {/* Scope Panel */}
          <ScopePanel data={data.scope} />

          {/* Estimate + Pricing Panel */}
          <EstimatePricingPanel data={data.estimate} />

          {/* Proposal Panel */}
          <ProposalPanel data={data.proposal} onCopy={handleCopy} copied={copied} />
        </div>

        {/* Adjuster Communication Log */}
        {data.adjusterCommunications && data.adjusterCommunications.length > 0 && (
          <AdjusterCommunicationLog communications={data.adjusterCommunications} />
        )}

        {/* Claim Journey Timeline */}
        {data.timeline && data.timeline.length > 0 && (
          <ClaimJourneyTimeline timeline={data.timeline} discrepancies={data.discrepancies || []} />
        )}

        {/* Activity Feed */}
        {data.activityFeed && data.activityFeed.length > 0 && (
          <ActivityFeed activities={data.activityFeed} />
        )}

        {/* Phone Script Engine */}
        <PhoneScriptEngine 
          contactId={contactId} 
          onScriptGenerated={() => {
            // Reload data if needed
            if (onActionComplete) {
              onActionComplete();
            }
          }}
        />

        {/* Price Objection Brain Panel */}
        {data?.homeownerOverview?.threadId && (
          <PriceObjectionBrainPanel threadId={data.homeownerOverview.threadId} />
        )}
      </CardContent>
    </Card>
  );
}

