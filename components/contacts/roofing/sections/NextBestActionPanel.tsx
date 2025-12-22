// Block 21230 — SmartSend Roofing "Next Best Action" Brain v1
// Displays the single highest-ROI action for a lead

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Phone,
  Mail,
  FileText,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  RefreshCw,
} from "lucide-react";

interface NextBestActionPanelProps {
  threadId: string;
  onActionComplete?: () => void;
}

interface NextBestActionData {
  action: string;
  priority: "HIGH" | "MEDIUM" | "LOW" | "URGENT";
  details: {
    action: string;
    why: string[];
    context: Record<string, any>;
    roi_estimate: string;
  };
  metadata?: {
    calculated_at: string;
    version: string;
  };
  calculated_at?: string;
}

export function NextBestActionPanel({
  threadId,
  onActionComplete,
}: NextBestActionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<NextBestActionData | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadNextBestAction();
  }, [threadId]);

  async function loadNextBestAction() {
    if (!threadId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/next-best-action`);
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? "Failed to load next best action");
        setData(null);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load next best action");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecalculate() {
    if (!threadId) return;

    setRecalculating(true);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/next-best-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_reason: "manual_recalculation" }),
      });

      const json = await res.json();
      if (res.ok) {
        setData(json);
        if (onActionComplete) {
          onActionComplete();
        }
      } else {
        setError(json?.error ?? "Failed to recalculate");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  }

  function getPriorityIcon(priority: string) {
    switch (priority) {
      case "URGENT":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "HIGH":
        return <Zap className="h-5 w-5 text-orange-600" />;
      case "MEDIUM":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "LOW":
        return <CheckCircle className="h-5 w-5 text-gray-600" />;
      default:
        return null;
    }
  }

  function getPriorityBadgeColor(priority: string) {
    switch (priority) {
      case "URGENT":
        return "bg-red-100 text-red-700 border-red-300";
      case "HIGH":
        return "bg-orange-100 text-orange-700 border-orange-300";
      case "MEDIUM":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "LOW":
        return "bg-gray-100 text-gray-700 border-gray-300";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  function getActionIcon(action: string) {
    switch (action) {
      case "call_now":
        return <Phone className="h-5 w-5" />;
      case "send_proposal":
        return <FileText className="h-5 w-5" />;
      case "follow_up_now":
        return <Mail className="h-5 w-5" />;
      case "request_approval_letter":
        return <FileText className="h-5 w-5" />;
      case "send_supplement_request":
        return <MessageSquare className="h-5 w-5" />;
      case "send_photos":
        return <FileText className="h-5 w-5" />;
      case "explain_deductible":
        return <MessageSquare className="h-5 w-5" />;
      case "use_objection_response":
        return <MessageSquare className="h-5 w-5" />;
      case "send_reengagement":
        return <Mail className="h-5 w-5" />;
      case "maintain":
        return <CheckCircle className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  }

  function handleActionClick(action: string) {
    // TODO: Implement action handlers
    console.log("Action clicked:", action);
    // This will be connected to actual action handlers in the parent component
  }

  if (loading) {
    return (
      <Card className="w-full border-2 border-blue-200">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="w-full border-2 border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            Next Best Action
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error || "No action available"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="mt-2"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${recalculating ? "animate-spin" : ""}`} />
            Recalculate
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-2 border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {getPriorityIcon(data.priority)}
            Next Best Action
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={getPriorityBadgeColor(data.priority)}>
              {data.priority}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="h-8 w-8 p-0"
              title="Recalculate"
            >
              <RefreshCw className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Recommended Action */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getActionIcon(data.action)}</div>
          <div className="flex-1">
            <p className="font-semibold text-base mb-2">
              {data.details?.action || "No action specified"}
            </p>

            {/* Why Section */}
            {data.details?.why && data.details.why.length > 0 && (
              <div className="space-y-1 mb-3">
                <p className="text-sm font-medium text-muted-foreground mb-1">Why:</p>
                <ul className="list-disc list-inside space-y-1">
                  {data.details.why.map((reason, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Context Info */}
            {data.details?.context && Object.keys(data.details.context).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex flex-wrap gap-2">
                  {data.details.context.install_ready_score !== undefined && (
                    <Badge variant="outline" className="text-xs">
                      Install-Ready Score: {data.details.context.install_ready_score}
                    </Badge>
                  )}
                  {data.details.context.proposal_view_count !== undefined && (
                    <Badge variant="outline" className="text-xs">
                      Proposal Views: {data.details.context.proposal_view_count}
                    </Badge>
                  )}
                  {data.details.context.underpayment_amount !== undefined && (
                    <Badge variant="outline" className="text-xs">
                      Underpayment: ${data.details.context.underpayment_amount?.toLocaleString()}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
          {data.action === "call_now" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("call_now")}
              className="flex items-center gap-2"
            >
              <Phone className="h-4 w-4" />
              Generate Call Script
            </Button>
          )}
          {data.action === "send_proposal" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("send_proposal")}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Send Proposal
            </Button>
          )}
          {data.action === "follow_up_now" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("follow_up_now")}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Send Follow-Up
            </Button>
          )}
          {data.action === "request_approval_letter" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("request_approval_letter")}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Send Request Message
            </Button>
          )}
          {data.action === "send_supplement_request" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("send_supplement_request")}
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Generate Adjuster Email
            </Button>
          )}
          {data.action === "send_photos" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("send_photos")}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Send Photos
            </Button>
          )}
          {data.action === "explain_deductible" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("explain_deductible")}
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Send Deductible Explanation
            </Button>
          )}
          {data.action === "use_objection_response" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("use_objection_response")}
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              View Objection Response
            </Button>
          )}
          {data.action === "send_reengagement" && (
            <Button
              size="sm"
              onClick={() => handleActionClick("send_reengagement")}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              Send Reengagement Message
            </Button>
          )}
          {data.action === "maintain" && (
            <div className="text-sm text-muted-foreground">
              No action needed at this time
            </div>
          )}

          {/* Generic action buttons */}
          {data.action !== "maintain" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleActionClick("add_reminder")}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Add Reminder
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleActionClick("mark_completed")}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Mark Completed
              </Button>
            </>
          )}
        </div>

        {/* Metadata */}
        {data.metadata?.calculated_at && (
          <div className="text-xs text-muted-foreground pt-2 border-t border-gray-200">
            Calculated {new Date(data.metadata.calculated_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































