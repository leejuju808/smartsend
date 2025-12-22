"use client";

// Block 35333 — Lead Revival Section
// Shows revival information and actions for a specific lead

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Calendar, AlertCircle, CheckCircle } from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface LeadRevivalSectionProps {
  leadId: string;
  workspaceId: string;
}

export function LeadRevivalSection({ leadId, workspaceId }: LeadRevivalSectionProps) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/revival/lead-status?lead_id=${leadId}&workspace_id=${workspaceId}`,
    fetcher
  );

  const [sending, setSending] = useState(false);

  const handleSendRevival = async (level: number) => {
    setSending(true);
    try {
      const response = await fetch("/api/revival/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          workspaceId,
          sequenceLevel: level,
          channel: "sms",
        }),
      });

      if (response.ok) {
        mutate();
        alert("Revival message sent successfully!");
      } else {
        const error = await response.json();
        alert(`Failed to send message: ${error.error}`);
      }
    } catch (err) {
      alert("Error sending revival message");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="h-20 bg-gray-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null; // Don't show if lead is not dead
  }

  const { lead, statusHistory, revivalEvents, revivalSequences } = data;

  if (lead.status !== "dead" && lead.status !== "revived") {
    return null; // Only show for dead/revived leads
  }

  const getRevivalScoreColor = (score: number | null) => {
    if (!score) return "bg-gray-100 text-gray-600";
    if (score >= 60) return "bg-green-100 text-green-700";
    if (score >= 40) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Revival Information</CardTitle>
          {lead.status === "dead" && lead.revival_score !== null && (
            <Badge className={getRevivalScoreColor(lead.revival_score)}>
              Score: {lead.revival_score}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          {lead.status === "dead" ? (
            <AlertCircle className="h-4 w-4 text-red-600" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          <span className="text-sm font-medium">
            Status: {lead.status === "dead" ? "Dead Lead" : "Revived"}
          </span>
        </div>

        {/* Last Activity */}
        {lead.last_activity_at && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              Last activity: {new Date(lead.last_activity_at).toLocaleDateString()} (
              {Math.floor(
                (new Date().getTime() - new Date(lead.last_activity_at).getTime()) /
                  (1000 * 60 * 60 * 24)
              )}{" "}
              days ago)
            </span>
          </div>
        )}

        {/* Status History */}
        {statusHistory && statusHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Status History</h4>
            <div className="space-y-1">
              {statusHistory.slice(0, 3).map((history: any) => (
                <div key={history.id} className="text-xs text-muted-foreground">
                  {history.old_status} → {history.new_status}
                  {history.reason && ` (${history.reason})`}
                  <span className="ml-2">
                    {new Date(history.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revival Messages Sent */}
        {revivalSequences && revivalSequences.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Revival Messages</h4>
            <div className="space-y-2">
              {revivalSequences.map((seq: any) => (
                <div
                  key={seq.id}
                  className="text-xs border rounded p-2 bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium">Level {seq.sequence_level}</span>
                    <Badge variant="outline" className="text-xs">
                      {seq.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate">{seq.message}</p>
                  {seq.sent_at && (
                    <span className="text-muted-foreground">
                      Sent: {new Date(seq.sent_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {lead.status === "dead" && (
          <div className="pt-2 border-t">
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleSendRevival(1)}
                disabled={sending}
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Send Revival Message
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
































