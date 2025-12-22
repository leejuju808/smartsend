// Block 21140 — SmartSend Proposal Follow-Up Brain v2 Panel

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Clock, 
  Mail, 
  Send, 
  Calendar,
  Eye,
  Smartphone,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";

interface ProposalFollowUpBrainPanelProps {
  proposalId: string;
  onActionComplete?: () => void;
}

interface FollowUpPanelData {
  proposal_id: string;
  thread_id: string;
  analytics: {
    view_count: number;
    last_viewed_at: string | null;
    viewed_on_phone: boolean;
    forwarded_to_spouse: boolean;
    forwarded_to_adjuster: boolean;
  };
  install_ready_score: number | null;
  install_ready_status: string | null;
  recommended_followup: {
    type: string;
    scheduled_time: string;
    timing_reason: string;
    urgency_level: string;
  };
  next_scheduled_followup: {
    id: string;
    scheduled_at: string;
    type: string;
    tone: string;
  } | null;
  can_send: boolean;
  conditions_reason: string;
  followup_enabled: boolean;
  followup_stopped: boolean;
}

export function ProposalFollowUpBrainPanel({
  proposalId,
  onActionComplete,
}: ProposalFollowUpBrainPanelProps) {
  const [loading, setLoading] = useState(true);
  const [panelData, setPanelData] = useState<FollowUpPanelData | null>(null);
  const [sending, setSending] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    loadPanelData();
  }, [proposalId]);

  const loadPanelData = async () => {
    try {
      const response = await fetch(`/api/inbox/proposals/${proposalId}/followup`);
      if (response.ok) {
        const data = await response.json();
        setPanelData(data.panel);
      }
    } catch (error) {
      console.error("Error loading follow-up panel:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendNow = async () => {
    if (!panelData) return;
    
    setSending(true);
    try {
      const response = await fetch(`/api/inbox/proposals/${proposalId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          send_now: true,
        }),
      });

      if (response.ok) {
        await loadPanelData();
        onActionComplete?.();
      }
    } catch (error) {
      console.error("Error sending follow-up:", error);
    } finally {
      setSending(false);
    }
  };

  const handleReschedule = async (followupId: string) => {
    setRescheduling(true);
    try {
      // Calculate new time (next morning)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);

      const response = await fetch(
        `/api/inbox/proposals/${proposalId}/followup/${followupId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reschedule",
            scheduled_at: tomorrow.toISOString(),
          }),
        }
      );

      if (response.ok) {
        await loadPanelData();
      }
    } catch (error) {
      console.error("Error rescheduling follow-up:", error);
    } finally {
      setRescheduling(false);
    }
  };

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-red-100 text-red-700 border-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getFollowUpTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      soft_friendly: "Soft Friendly",
      urgency_based: "Urgency-Based",
      insurance_aware: "Insurance-Aware",
      price_objection: "Price Objection",
      deadline_based: "Deadline-Based",
      closing_push: "Closing Push",
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Proposal Follow-Up Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!panelData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Proposal Follow-Up Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No follow-up data available</div>
        </CardContent>
      </Card>
    );
  }

  const { analytics, recommended_followup, next_scheduled_followup, can_send } = panelData;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Proposal Follow-Up Brain (v2)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Analytics Section */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Proposal Analytics</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Viewed:</span>
              <span className="font-medium">{analytics.view_count || 0} times</span>
            </div>
            {analytics.last_viewed_at && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last viewed:</span>
                <span className="font-medium">
                  {formatDistanceToNow(new Date(analytics.last_viewed_at), { addSuffix: true })}
                </span>
              </div>
            )}
            {analytics.viewed_on_phone && (
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Device:</span>
                <span className="font-medium">Phone</span>
              </div>
            )}
            {analytics.forwarded_to_spouse && (
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Forwarded to spouse</span>
              </div>
            )}
          </div>
        </div>

        {/* Install-Ready Score */}
        {panelData.install_ready_score !== null && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Install-Ready Score</span>
              <Badge
                variant={
                  panelData.install_ready_score >= 70
                    ? "default"
                    : panelData.install_ready_score >= 50
                    ? "secondary"
                    : "outline"
                }
              >
                {panelData.install_ready_score}/100
                {panelData.install_ready_status && ` (${panelData.install_ready_status})`}
              </Badge>
            </div>
          </div>
        )}

        {/* Recommended Follow-Up */}
        <div className="pt-2 border-t">
          <div className="text-sm font-medium mb-2">Recommended Follow-Up</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type:</span>
              <Badge variant="outline">
                {getFollowUpTypeLabel(recommended_followup.type)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Urgency:</span>
              <Badge className={getUrgencyColor(recommended_followup.urgency_level)}>
                {recommended_followup.urgency_level}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {recommended_followup.timing_reason}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {format(new Date(recommended_followup.scheduled_time), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          </div>
        </div>

        {/* Next Scheduled Follow-Up */}
        {next_scheduled_followup && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2">Next Scheduled Follow-Up</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scheduled:</span>
                <span className="text-sm font-medium">
                  {format(new Date(next_scheduled_followup.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Badge variant="outline">
                  {getFollowUpTypeLabel(next_scheduled_followup.type)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendNow()}
                  disabled={sending}
                  className="flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Now
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReschedule(next_scheduled_followup.id)}
                  disabled={rescheduling}
                  className="flex items-center gap-2"
                >
                  {rescheduling ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Rescheduling...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4" />
                      Reschedule
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            {can_send ? (
              <Badge className="bg-green-100 text-green-700 border-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ready to Send
              </Badge>
            ) : (
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">
                <AlertCircle className="h-3 w-3 mr-1" />
                {panelData.conditions_reason || "Cannot Send"}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        {can_send && !next_scheduled_followup && (
          <div className="pt-2 border-t">
            <Button
              onClick={handleSendNow}
              disabled={sending}
              className="w-full flex items-center gap-2"
            >
              {sending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Schedule Follow-Up
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































