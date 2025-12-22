"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, AlertTriangle, CheckCircle, Clock, DollarSign, Eye, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdjusterToolsCardProps {
  conversationId: string;
  initialAdjusterEmail?: string | null;
  initialAdjusterName?: string | null;
  initialClaimNumber?: string | null;
}

interface Trigger {
  type: string;
  priority: string;
  recommended_action: string;
  email_type: string;
  missing_items?: string[];
  days_since_activity?: number;
  insurance_rcv?: number;
  smart_send_estimate?: number;
  difference?: number;
}

interface TriggersResponse {
  triggers: Trigger[];
  adjuster_name?: string;
  adjuster_email?: string;
  claim_number?: string;
  days_since_activity?: number;
  error?: string;
}

export function AdjusterToolsCard({
  conversationId,
  initialAdjusterEmail,
  initialAdjusterName,
  initialClaimNumber,
}: AdjusterToolsCardProps) {
  const [loading, setLoading] = useState(true);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [adjusterInfo, setAdjusterInfo] = useState({
    name: initialAdjusterName || "",
    email: initialAdjusterEmail || "",
    claimNumber: initialClaimNumber || "",
  });
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedEmailType, setSelectedEmailType] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId && adjusterInfo.email) {
      fetchTriggers();
    } else {
      setLoading(false);
    }
  }, [conversationId, adjusterInfo.email]);

  const fetchTriggers = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/inbox/adjuster/triggers?thread_id=${conversationId}`
      );
      if (response.ok) {
        const data: TriggersResponse = await response.json();
        if (data.error) {
          console.error("Error fetching triggers:", data.error);
          setTriggers([]);
        } else {
          setTriggers(data.triggers || []);
          if (data.adjuster_name) setAdjusterInfo((prev) => ({ ...prev, name: data.adjuster_name || prev.name }));
          if (data.adjuster_email) setAdjusterInfo((prev) => ({ ...prev, email: data.adjuster_email || prev.email }));
          if (data.claim_number) setAdjusterInfo((prev) => ({ ...prev, claimNumber: data.claim_number || prev.claimNumber }));
        }
      }
    } catch (error) {
      console.error("Error fetching triggers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateEmail = async (emailType: string, triggerReason: string) => {
    try {
      setGenerating(true);
      setSelectedEmailType(emailType);
      
      const response = await fetch("/api/inbox/adjuster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: conversationId,
          email_type: emailType,
          trigger_reason: triggerReason,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPreviewEmail(data.email);
        setShowPreview(true);
      } else {
        const error = await response.json();
        alert(`Failed to generate email: ${error.error}`);
      }
    } catch (error: any) {
      console.error("Error generating email:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!previewEmail) return;

    try {
      setSending(true);
      const response = await fetch("/api/inbox/adjuster/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: conversationId,
        }),
      });

      if (response.ok) {
        alert("Email queued for sending!");
        setShowPreview(false);
        setPreviewEmail(null);
        // Refresh triggers
        fetchTriggers();
      } else {
        const error = await response.json();
        alert(`Failed to send email: ${error.error}`);
      }
    } catch (error: any) {
      console.error("Error sending email:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  if (!adjusterInfo.email) {
    return (
      <div className="p-4 border rounded-lg bg-white">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold">Adjuster Communication</h3>
        </div>
        <p className="text-xs text-gray-500">
          Add adjuster email address in Insurance Claim card to enable adjuster communication tools.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-white">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const highPriorityTriggers = triggers.filter((t) => t.priority === "high");
  const mediumPriorityTriggers = triggers.filter((t) => t.priority === "medium");

  return (
    <>
      <div className="p-4 border rounded-lg bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold">Adjuster Communication (AI-Generated)</h3>
        </div>

        {highPriorityTriggers.length > 0 && (
          <Alert className="mb-3 border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-xs">
              <strong>Missing Items Detected</strong>
              <ul className="mt-1 ml-4 list-disc">
                {highPriorityTriggers[0].missing_items?.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {highPriorityTriggers.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-600 mb-2">
              <strong>Recommended Action:</strong> {highPriorityTriggers[0].recommended_action}
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() =>
                handleGenerateEmail(
                  highPriorityTriggers[0].email_type,
                  highPriorityTriggers[0].type
                )
              }
              disabled={generating}
            >
              {generating ? (
                <>Generating...</>
              ) : (
                <>
                  <Send className="h-3 w-3 mr-2" />
                  Send Supplement Email
                </>
              )}
            </Button>
          </div>
        )}

        {mediumPriorityTriggers.length > 0 && (
          <div className="space-y-2">
            {mediumPriorityTriggers.map((trigger, idx) => (
              <div key={idx} className="p-2 bg-gray-50 rounded text-xs">
                <div className="flex items-center gap-2 mb-1">
                  {trigger.type === "approval_pending_too_long" && (
                    <Clock className="h-3 w-3 text-yellow-600" />
                  )}
                  {trigger.type === "pricing_dispute" && (
                    <DollarSign className="h-3 w-3 text-yellow-600" />
                  )}
                  <span className="font-medium">{trigger.recommended_action}</span>
                </div>
                {trigger.days_since_activity && (
                  <p className="text-gray-600">
                    {trigger.days_since_activity} days since last activity
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => handleGenerateEmail(trigger.email_type, trigger.type)}
                  disabled={generating}
                >
                  {trigger.type === "approval_pending_too_long" ? "Follow Up Again" : "Dispute Pricing"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {triggers.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-4">
            <CheckCircle className="h-4 w-4 mx-auto mb-2 text-green-600" />
            <p>No immediate actions needed</p>
            <p className="mt-1">All items appear to be covered</p>
          </div>
        )}

        <div className="mt-3 pt-3 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => handleGenerateEmail("general_follow_up", "manual_trigger")}
            disabled={generating}
          >
            <Mail className="h-3 w-3 mr-2" />
            Message Adjuster
          </Button>
        </div>
      </div>

      {/* Email Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Review the generated email before sending to {adjusterInfo.name || adjusterInfo.email}
            </DialogDescription>
          </DialogHeader>
          {previewEmail && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700">To:</label>
                <p className="text-sm">{previewEmail.adjuster_email}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Subject:</label>
                <p className="text-sm font-semibold">{previewEmail.subject}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Body:</label>
                <div
                  className="text-sm border rounded p-3 bg-gray-50 max-h-96 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: previewEmail.body_html }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="flex-1"
                >
                  {sending ? "Sending..." : "Send Email"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(false)}
                  disabled={sending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
















































