// Block 22262 — SmartSend Roofing Proposal Follow-Up Engine v1
// Proposal Follow-Up Schedule Panel

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Clock, Mail, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";

type Followup = {
  id: string;
  step_number: number;
  intent: string;
  send_at: string;
  status: "pending" | "sent" | "cancelled" | "failed";
};

interface ProposalFollowupPanelProps {
  proposalId: string;
}

export function ProposalFollowupPanel({
  proposalId,
}: ProposalFollowupPanelProps) {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFollowups();
  }, [proposalId]);

  const loadFollowups = async () => {
    try {
      const response = await fetch(
        `/api/proposals/${proposalId}/followups`
      );
      if (response.ok) {
        const data = await response.json();
        setFollowups(data.followups || []);
      }
    } catch (error) {
      console.error("Error loading followups:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <Badge variant="default" className="bg-green-100 text-green-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Sent
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-600">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case "HOT":
        return "text-red-600 font-semibold";
      case "WARM":
        return "text-orange-600 font-semibold";
      case "COLD":
        return "text-blue-600 font-semibold";
      case "NO_INTENT":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Follow-Up Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!followups || followups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Follow-Up Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No follow-ups scheduled yet. They'll be created automatically when
            this proposal is sent.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Follow-Up Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {followups.map((f) => (
            <li
              key={f.id}
              className="flex justify-between items-start p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">
                    Step {f.step_number}
                  </span>
                  <span className={`text-sm ${getIntentColor(f.intent)}`}>
                    • {f.intent}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {format(new Date(f.send_at), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
              </div>
              <div className="ml-4">{getStatusBadge(f.status)}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}








































