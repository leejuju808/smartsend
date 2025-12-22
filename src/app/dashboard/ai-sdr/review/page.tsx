"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";

interface PendingAction {
  id: string;
  thread_id: string;
  lead_id: string;
  campaign_id: string | null;
  action_type: "send_followup" | "reply_interest" | "revive_lead";
  suggested_subject: string | null;
  suggested_body: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  created_at: string;
  leads: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  campaigns: {
    id: string;
    name: string | null;
    title: string | null;
  } | null;
}

export default function AISDRReviewPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadPendingActions();
  }, [supabase]);

  const loadPendingActions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("ai_sdr_pending_actions")
        .select(
          `
          *,
          leads!inner(id, email, first_name, last_name),
          campaigns(id, name, title)
        `
        )
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingActions((data as any) || []);
    } catch (error) {
      console.error("Error loading pending actions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (action: PendingAction, subject?: string, body?: string) => {
    setProcessing(action.id);
    try {
      const response = await fetch("/api/ai-sdr/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          pending_id: action.id,
          subject: subject || action.suggested_subject,
          body: body || action.suggested_body,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to approve");
      }

      // Remove from list
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      setEditingId(null);
      alert("Email approved and sent!");
    } catch (error) {
      console.error("Error approving:", error);
      alert(`Failed to approve: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (action: PendingAction) => {
    if (!confirm("Are you sure you want to reject this action?")) return;

    setProcessing(action.id);
    try {
      const response = await fetch("/api/ai-sdr/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          pending_id: action.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reject");
      }

      // Remove from list
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      alert("Action rejected");
    } catch (error) {
      console.error("Error rejecting:", error);
      alert(`Failed to reject: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setProcessing(null);
    }
  };

  const getActionTypeBadge = (type: string) => {
    const badges: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "success" }> = {
      send_followup: { label: "Follow-up", variant: "default" },
      reply_interest: { label: "Interest Reply", variant: "success" },
      revive_lead: { label: "Revival", variant: "outline" },
    };
    const badge = badges[type] || { label: type, variant: "secondary" };
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const getLeadName = (lead: PendingAction["leads"]) => {
    if (lead.first_name || lead.last_name) {
      return `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
    }
    return lead.email;
  };

  const getCampaignName = (campaign: PendingAction["campaigns"]) => {
    if (!campaign) return "No campaign";
    return campaign.name || campaign.title || "Unnamed campaign";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading review queue...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">AI SDR Review Queue</h1>
        <p className="text-muted-foreground">
          Review and approve or reject AI SDR actions before they are sent.
        </p>
      </div>

      {pendingActions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No pending actions to review.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Pending Actions ({pendingActions.length})</CardTitle>
            <CardDescription>
              Review each action and either approve (with optional edits) or reject it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {pendingActions.map((action) => (
                <div
                  key={action.id}
                  className="border rounded-lg p-4 space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getLeadName(action.leads)} ({action.leads.email})
                        </span>
                        {getActionTypeBadge(action.action_type)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Campaign: {getCampaignName(action.campaigns)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {new Date(action.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {editingId === action.id ? (
                    <div className="space-y-3 border-t pt-4">
                      <div>
                        <Label htmlFor={`subject-${action.id}`}>Subject</Label>
                        <Input
                          id={`subject-${action.id}`}
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`body-${action.id}`}>Body</Label>
                        <Textarea
                          id={`body-${action.id}`}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="mt-1 min-h-[120px]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApprove(action, editSubject, editBody)}
                          disabled={processing === action.id}
                          size="sm"
                        >
                          {processing === action.id ? "Sending..." : "Approve & Send"}
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingId(null);
                            setEditSubject("");
                            setEditBody("");
                          }}
                          variant="outline"
                          size="sm"
                          disabled={processing === action.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 border-t pt-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Subject</Label>
                        <p className="text-sm font-medium">{action.suggested_subject || "No subject"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Body Preview</Label>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {action.suggested_body || "No body"}
                        </p>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => {
                            setEditingId(action.id);
                            setEditSubject(action.suggested_subject || "");
                            setEditBody(action.suggested_body || "");
                          }}
                          size="sm"
                          disabled={processing === action.id}
                        >
                          Edit & Approve
                        </Button>
                        <Button
                          onClick={() => handleApprove(action)}
                          variant="secondary"
                          size="sm"
                          disabled={processing === action.id}
                        >
                          {processing === action.id ? "Sending..." : "Approve & Send"}
                        </Button>
                        <Button
                          onClick={() => handleReject(action)}
                          variant="destructive"
                          size="sm"
                          disabled={processing === action.id}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

