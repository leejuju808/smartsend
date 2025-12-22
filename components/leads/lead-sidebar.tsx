"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssignDropdown } from "@/components/team/assign-dropdown";
import { TagManager } from "@/components/leads/tag-manager";
import { getScoreV3Color } from "@/lib/leads/scoring-v3";
import { ShieldAlert, Calendar } from "lucide-react";
import { LeadStatusDropdown } from "@/components/leads/LeadStatusDropdown";
import { RoofingLeadStatus } from "@/components/leads/LeadStatusBadge";
import { ScheduleEstimateModal } from "@/components/leads/ScheduleEstimateModal";
import { JobSaveBanner } from "@/components/job-save/JobSaveBanner";
import { NextActionBadge, NextActionType } from "@/components/NextActionBadge";
import { Brain, Sparkles } from "lucide-react";

// Block 11500: Lead Type Value Display Component
function LeadTypeValueDisplay({ leadId }: { leadId: string }) {
  const [classification, setClassification] = useState<string | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClassification() {
      try {
        const res = await fetch(`/api/leads/${leadId}/classification`);
        if (res.ok) {
          const data = await res.json();
          const classificationValue = data.classification || data.latest_intent || "NEW";
          setClassification(classificationValue);
          
          // Calculate value based on classification
          const valueMap: Record<string, number> = {
            HOT: 7000,
            WARM: 2500,
            FOLLOW_UP: 1000,
            NEW: 300,
            NOT_INTERESTED: 0,
            OUT_OF_SCOPE: 0,
          };
          setValue(valueMap[classificationValue.toUpperCase()] ?? 300);
        }
      } catch (error) {
        console.error("Failed to fetch classification:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchClassification();
  }, [leadId]);

  if (loading) {
    return (
      <div className="p-3 rounded-lg border bg-muted animate-pulse">
        <Label className="text-xs font-semibold uppercase opacity-70">
          Lead Type Value
        </Label>
        <p className="text-sm opacity-50 mt-1">Loading...</p>
      </div>
    );
  }

  const classificationLabel = classification?.toUpperCase() || "NEW";
  const displayValue = value ?? 0;

  return (
    <div className="p-3 rounded-lg border bg-gradient-to-br from-emerald-50 to-white">
      <Label className="text-xs font-semibold uppercase opacity-70">
        Lead Type Value
      </Label>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold text-emerald-600">
          ${displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </p>
        <Badge variant="outline" className="text-xs">
          {classificationLabel}
        </Badge>
      </div>
      <p className="text-xs opacity-60 mt-1">
        {classificationLabel === "HOT" && "Ready to book • High value"}
        {classificationLabel === "WARM" && "Interested • Good potential"}
        {classificationLabel === "FOLLOW_UP" && "Needs response • Moderate value"}
        {classificationLabel === "NEW" && "New lead • Low probability"}
        {(classificationLabel === "NOT_INTERESTED" || classificationLabel === "OUT_OF_SCOPE") && "No value"}
      </p>
    </div>
  );
}

interface Lead {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  website?: string | null;
  owner_id?: string | null;
  tags?: string[] | null;
  score_v3?: number | null;
  probability_reply?: number | null;
  probability_meeting?: number | null;
  next_estimate_at?: string | null;
  address?: string | null;
  next_action?: NextActionType | null;
  next_action_reason?: string | null;
  next_action_generated_at?: string | null;
}

interface LeadSidebarProps {
  lead: Lead;
  leadId: string;
  suppression?: { id: string; active: boolean; reason: string | null } | null;
}

export function LeadSidebar({ lead, leadId, suppression }: LeadSidebarProps) {
  const [phone, setPhone] = useState(lead.phone || "");
  const [linkedin, setLinkedin] = useState(lead.linkedin || "");
  const [website, setWebsite] = useState(lead.website || "");
  const [saving, setSaving] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<RoofingLeadStatus>("NEW");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // Fetch current status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/leads/${leadId}/status`);
        if (res.ok) {
          const data = await res.json();
          setCurrentStatus((data.status || "NEW") as RoofingLeadStatus);
        }
      } catch (error) {
        console.error("Failed to fetch lead status:", error);
      }
    }
    fetchStatus();
  }, [leadId]);

  const leadName =
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email ||
    "Unknown Lead";

  async function saveField(field: string, value: string) {
    setSaving(field);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) {
        console.error(`Failed to save ${field}`);
      }
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
    } finally {
      setSaving(null);
    }
  }

  async function handleUnsubscribe() {
    if (!confirm("Are you sure you want to unsubscribe this lead?")) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/unsubscribe`, {
        method: "POST",
      });
      if (res.ok) {
        alert("Lead unsubscribed");
      }
    } catch (error) {
      console.error("Failed to unsubscribe:", error);
    }
  }

  const scoreColor = getScoreV3Color(lead.score_v3);

  return (
    <div className="space-y-5 sticky top-0 p-5 border-r h-screen overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{leadName}</h2>
          {suppression?.active && (
            <Badge variant="destructive" className="flex items-center gap-1 text-[11px]">
              <ShieldAlert className="h-3 w-3" />
              Globally suppressed
            </Badge>
          )}
        </div>
        <p className="text-sm opacity-70">{lead.email}</p>
        {lead.company && <p className="text-sm opacity-70">{lead.company}</p>}
        {lead.title && <p className="text-sm opacity-70">{lead.title}</p>}
      </div>

      {/* Block 22073 — Job Save Engine: Banner for At-Risk Jobs */}
      <JobSaveBanner leadId={leadId} />

      {/* Block 22094 — AI Next-Action Engine: Next Best Action Box */}
      {lead.next_action && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-emerald-400" />
            <h3 className="text-lg font-semibold">Next Best Action</h3>
          </div>
          <div className="mb-3">
            <NextActionBadge
              action={lead.next_action}
              reason={lead.next_action_reason}
              variant="badge"
            />
          </div>
          {lead.next_action_reason && (
            <p className="text-sm text-gray-400 mb-3">{lead.next_action_reason}</p>
          )}
          <Button
            onClick={async () => {
              // Trigger action execution
              // This would integrate with your action execution system
              try {
                const res = await fetch(`/api/leads/${leadId}/execute-action`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: lead.next_action }),
                });
                if (res.ok) {
                  // Refresh or show success
                  window.location.reload();
                }
              } catch (error) {
                console.error("Failed to execute action:", error);
              }
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Execute Action
          </Button>
          {lead.next_action_generated_at && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Generated {new Date(lead.next_action_generated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Roofing Status */}
      <div className="space-y-1">
        <Label>Status</Label>
        <LeadStatusDropdown
          leadId={leadId}
          currentStatus={currentStatus}
          onStatusChange={(newStatus) => setCurrentStatus(newStatus)}
        />
      </div>

      {/* Block 21625: Scheduled Estimate Display */}
      {lead.next_estimate_at && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-md flex items-center gap-2">
          <Calendar className="h-3 w-3" />
          <span>
            Estimate scheduled for{" "}
            {new Date(lead.next_estimate_at).toLocaleString()}
          </span>
        </div>
      )}

      {/* Block 21625: Schedule Estimate Button */}
      <Button
        onClick={() => setScheduleModalOpen(true)}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        size="sm"
      >
        <Calendar className="h-4 w-4 mr-2" />
        Schedule Estimate
      </Button>

      {/* Block 11500: Lead Type Value */}
      <LeadTypeValueDisplay leadId={leadId} />

      {/* Lead Owner */}
      <div className="space-y-1">
        <Label>Owner</Label>
        <AssignDropdown
          type="lead"
          id={leadId}
          currentOwnerId={lead.owner_id}
          onAssign={() => window.location.reload()}
        />
      </div>

      {/* Phone */}
      <div className="space-y-1">
        <Label>Phone</Label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => saveField("phone", phone)}
          disabled={saving === "phone"}
          placeholder="+1 (555) 123-4567"
        />
      </div>

      {/* LinkedIn */}
      <div className="space-y-1">
        <Label>LinkedIn</Label>
        <Input
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          onBlur={() => saveField("linkedin", linkedin)}
          disabled={saving === "linkedin"}
          placeholder="https://linkedin.com/in/..."
        />
      </div>

      {/* Website */}
      <div className="space-y-1">
        <Label>Website</Label>
        <Input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          onBlur={() => saveField("website", website)}
          disabled={saving === "website"}
          placeholder="https://example.com"
        />
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <Label>Tags</Label>
        <TagManager leadId={leadId} />
      </div>

      {/* Lead Score v3 */}
      {lead.score_v3 !== null && lead.score_v3 !== undefined && (
        <div className={`p-3 rounded-lg border ${scoreColor}`}>
          <Label className="text-xs font-semibold uppercase opacity-70">
            Lead Score v3
          </Label>
          <p className="text-4xl font-bold mt-1">{lead.score_v3}</p>
          {lead.probability_reply !== null &&
            lead.probability_reply !== undefined && (
              <p className="text-sm opacity-70 mt-2">
                Reply Probability: {(lead.probability_reply * 100).toFixed(1)}%
              </p>
            )}
          {lead.probability_meeting !== null &&
            lead.probability_meeting !== undefined && (
              <p className="text-sm opacity-70">
                Meeting Probability: {(lead.probability_meeting * 100).toFixed(1)}%
              </p>
            )}
        </div>
      )}

      {/* Unsubscribe Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={handleUnsubscribe}
      >
        Unsubscribe
      </Button>

      {/* Block 21625: Schedule Estimate Modal */}
      <ScheduleEstimateModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        lead={lead}
        onScheduled={() => {
          // Refresh the page to show updated estimate info
          window.location.reload();
        }}
      />
    </div>
  );
}










