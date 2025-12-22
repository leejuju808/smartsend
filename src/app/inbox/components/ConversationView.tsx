"use client";

import { useState, useEffect } from "react";
import { Message, Thread as ThreadType } from "../page";
import { LeadSummaryHeader } from "./LeadSummaryHeader";
import { ActionButtons } from "./ActionButtons";
import { LeadActionBar } from "./LeadActionBar";
import { JobValueBar } from "@/components/inbox/JobValueBar";
import { LeadSnapshotCard } from "@/components/inbox/LeadSnapshotCard";
import { EngagementHeatCard } from "@/components/inbox/EngagementHeatCard";
import { ReplyComposer } from "@/components/inbox/ReplyComposer";
import { InternalNotesCard } from "@/components/inbox/InternalNotesCard";
import { ActivityTimelineCard } from "@/components/inbox/ActivityTimelineCard";
import { CallLogCard } from "@/components/inbox/CallLogCard";
import { AppointmentCard } from "@/components/inbox/AppointmentCard";
import { LostReasonCard } from "@/components/inbox/LostReasonCard";
import { InsuranceClaimCard } from "@/components/inbox/InsuranceClaimCard";
import { AdjusterToolsCard } from "@/components/inbox/AdjusterToolsCard";
import { PropertyRoofCard } from "@/components/inbox/PropertyRoofCard";
import { LeadTagsCard } from "@/components/inbox/LeadTagsCard";
import { InstallReadyPlaybookCard } from "@/components/inbox/InstallReadyPlaybookCard";
import HomeownerIntelCard from "@/components/inbox/HomeownerIntelCard";
import { NextBestActionCard } from "@/components/inbox/NextBestActionCard";
import { BehavioralInsightsCard } from "@/components/inbox/BehavioralInsightsCard";
import { ConversationThread } from "@/components/inbox/ConversationThread";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/Modal";
import { colors } from "../constants/colors";

interface ConversationViewProps {
  threadId: string;
}

export function ConversationView({ threadId }: ConversationViewProps) {
  const [thread, setThread] = useState<ThreadType | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [threadRefreshTrigger, setThreadRefreshTrigger] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkFirstName, setLinkFirstName] = useState("");
  const [linkLastName, setLinkLastName] = useState("");

  useEffect(() => {
    const fetchThread = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/inbox/owner/threads/${threadId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch thread");
        }

        const data = await response.json();
        setThread(data.thread);
        setMessages(data.messages || []);
        setAiSummary(data.aiSummary);
        setWorkspaceId(data.thread.workspaceId || null);
      } catch (error) {
        console.error("Error fetching thread:", error);
      } finally {
        setLoading(false);
      }
    };

    if (threadId) {
      fetchThread();
    }
  }, [threadId, threadRefreshTrigger]);

  // Prefill link modal from latest inbound message (best-effort).
  useEffect(() => {
    if (!linkOpen) return;
    if (linkEmail.trim()) return;
    const lastInbound = [...(messages || [])].reverse().find((m: any) => {
      const dir = String((m as any)?.direction || (m as any)?.status || "").toLowerCase();
      return dir.includes("in");
    }) as any;
    const inferred = String(lastInbound?.from_email || "").trim();
    if (inferred) setLinkEmail(inferred);
  }, [linkOpen, linkEmail, messages]);

  if (loading) {
    return (
      <div className="h-full p-6 space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Thread not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Lead Summary Header */}
      <div
        className="border-b p-6"
        style={{
          backgroundColor: colors.white,
          borderColor: colors.divider,
        }}
      >
        <LeadSummaryHeader thread={thread} />
      </div>

      {/* BLOCK 271000 — Default Reality Sprint: unlinked conversations are not "real" yet */}
      {!thread.contactId ? (
        <div className="px-6 py-3 border-b" style={{ backgroundColor: "#fff7ed", borderColor: "#fed7aa" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: "#9a3412" }}>
                This conversation isn’t real yet (unlinked)
              </div>
              <div className="mt-1 text-xs" style={{ color: "#9a3412" }}>
                Link it to a homeowner record so it can be tracked, assigned, and moved through Jobs.
              </div>
            </div>
            <button
              onClick={() => setLinkOpen(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-black text-white text-xs hover:opacity-90"
            >
              Link homeowner
            </button>
          </div>
        </div>
      ) : null}

      {/* Lead Action Bar */}
      <div
        className="border-b p-4"
        style={{
          backgroundColor: colors.white,
          borderColor: colors.divider,
        }}
      >
        <LeadActionBar
          conversationId={thread.id}
          initialStage={(thread.leadStage as any) || "new"}
          initialNextActionAt={thread.nextActionAt}
          initialAssigneeId={thread.assignedToUserId || null}
          onUpdated={(updatedThread) => {
            setThread({ ...thread, ...updatedThread });
          }}
        />
      </div>

      {/* Source Campaign Chip */}
      {(thread as any).sourceCampaignName && (
        <div className="px-6 pb-2 -mt-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-700">
            From campaign: <span className="ml-1 font-semibold">{(thread as any).sourceCampaignName}</span>
          </span>
        </div>
      )}

      {/* Job Value Bar */}
      <div
        className="border-b p-4"
        style={{
          backgroundColor: colors.white,
          borderColor: colors.divider,
        }}
      >
        <JobValueBar
          conversationId={thread.id}
          initialEstimated={(thread as any).estimatedJobValue}
          initialActual={(thread as any).actualJobValue}
          initialInsuranceClaim={(thread as any).isInsuranceClaim}
          initialInsuranceCarrier={(thread as any).insuranceCarrier}
          onUpdated={(updatedThread) => {
            setThread({ ...thread, ...updatedThread });
          }}
        />
      </div>

      {/* AI Lead Snapshot */}
      <div
        className="border-b p-4"
        style={{
          backgroundColor: colors.white,
          borderColor: colors.divider,
        }}
      >
        <LeadSnapshotCard conversationId={thread.id} />
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div
          className="border-b p-5 rounded-lg mx-4 my-4"
          style={{
            backgroundColor: colors.panelBg,
            borderLeft: `4px solid ${colors.primary}`,
            borderRadius: "8px",
          }}
        >
          <h3
            className="text-sm font-semibold mb-2"
            style={{ color: colors.ink }}
          >
            AI Summary
          </h3>
          <p
            className="text-sm leading-relaxed"
            style={{ color: colors.inkSecondary, lineHeight: "1.5" }}
          >
            {aiSummary}
          </p>
          {aiSummary.toLowerCase().includes("suggested") && (
            <p
              className="text-sm italic mt-2"
              style={{ color: colors.inkSecondary }}
            >
              Suggested Action: {aiSummary.match(/suggested action:?\s*(.+)/i)?.[1] || "Review and respond"}
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div
        className="border-b p-4"
        style={{
          backgroundColor: colors.white,
          borderColor: colors.divider,
        }}
      >
        {thread.intent === "hot" && (thread.leadStage === "new" || thread.leadStage === "working") && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="font-semibold">Next step: Book estimate</div>
            <div className="text-xs text-amber-900/80">
              Call, text, or schedule the inspection. Don’t let a hot conversation die.
            </div>
          </div>
        )}
        <ActionButtons threadId={threadId} contactPhone={thread.contactPhone} />
      </div>

      {/* Conversation Messages + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
        {/* Messages Column (2/3 width) */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden">
          {/* Conversation Thread */}
          <ConversationThread
            conversationId={thread.id}
            refreshTrigger={threadRefreshTrigger}
          />

          {/* Reply Composer */}
          <div
            className="border-t p-4"
            style={{
              backgroundColor: colors.white,
              borderColor: colors.divider,
            }}
          >
            <ReplyComposer
              conversationId={thread.id}
              workspaceId={workspaceId}
              homeownerName={thread.contactName}
              homeownerEmail={thread.contactEmail}
              defaultSubject={thread.lastMessagePreview ? `Re: ${thread.lastMessagePreview.slice(0, 50)}` : undefined}
              onSent={(updatedConversation) => {
                // Refresh thread and messages after sending
                const fetchThread = async () => {
                  try {
                    const response = await fetch(`/api/inbox/owner/threads/${threadId}`);
                    if (response.ok) {
                      const data = await response.json();
                      setThread(data.thread);
                      setMessages(data.messages || []);
                      // Trigger ConversationThread refresh
                      setThreadRefreshTrigger((prev) => prev + 1);
                    }
                  } catch (error) {
                    console.error("Error refreshing thread:", error);
                  }
                };
                fetchThread();
              }}
            />
          </div>
        </div>

        {/* Right Sidebar (1/3 width) */}
        <div className="space-y-3 overflow-y-auto p-4" style={{ backgroundColor: colors.panelBg }}>
          <HomeownerIntelCard convo={thread as any} />
          <NextBestActionCard conversationId={thread.id} />
          <BehavioralInsightsCard conversationId={thread.id} />
          <EngagementHeatCard
            conversationId={thread.id}
            score={(thread as any).engagement_score}
            level={(thread as any).engagement_level}
            onUpdated={(updatedThread) => {
              setThread({ ...thread, ...updatedThread });
            }}
          />
          <PropertyRoofCard
            conversationId={thread.id}
            initialSqft={(thread as any).property_sqft}
            initialBedrooms={(thread as any).property_bedrooms}
            initialBathrooms={(thread as any).property_bathrooms}
            initialYearBuilt={(thread as any).property_year_built}
            initialEstimatedValue={(thread as any).property_estimated_value}
            initialRoofMaterial={(thread as any).roof_material}
            initialRoofLastReplacementYear={(thread as any).roof_last_replacement_year}
            initialRoofAgeEstimated={(thread as any).roof_age_estimated}
            onUpdated={(updatedThread) => {
              setThread({ ...thread, ...updatedThread });
            }}
          />
          <LeadTagsCard conversationId={thread.id} />
          <InsuranceClaimCard
            conversationId={thread.id}
            initialIsClaim={(thread as any).is_insurance_claim}
            initialCarrier={(thread as any).insurance_carrier}
            initialClaimNumber={(thread as any).insurance_claim_number}
            initialAdjusterName={(thread as any).insurance_adjuster_name}
            initialAdjusterPhone={(thread as any).insurance_adjuster_phone}
            initialAdjusterEmail={(thread as any).insurance_adjuster_email}
            initialDeductible={(thread as any).insurance_deductible}
            initialStatus={(thread as any).insurance_status}
            initialNotes={(thread as any).insurance_notes}
            onUpdated={(updatedThread) => {
              setThread({ ...thread, ...updatedThread });
            }}
          />
          <AdjusterToolsCard
            conversationId={thread.id}
            initialAdjusterEmail={(thread as any).insurance_adjuster_email}
            initialAdjusterName={(thread as any).insurance_adjuster_name}
            initialClaimNumber={(thread as any).insurance_claim_number}
          />
          <InstallReadyPlaybookCard
            conversationId={thread.id}
            initialInstallReady={(thread as any).insurance_install_ready}
          />
          <CallLogCard
            conversationId={thread.id}
            initialCallCount={(thread as any).call_count}
            initialLastCallOutcome={(thread as any).last_call_outcome}
            initialLastCallAt={(thread as any).last_call_at}
            onUpdated={(updatedThread) => {
              setThread({ ...thread, ...updatedThread });
            }}
          />
          <div id="appointment-card">
            <AppointmentCard
              conversationId={thread.id}
              initialType={(thread as any).appointment_type}
              initialAt={(thread as any).appointment_at}
              initialStatus={(thread as any).appointment_status}
              initialNotes={(thread as any).appointment_notes}
              initialAddressOverride={(thread as any).appointment_address_override}
              onUpdated={(updatedThread) => {
                setThread({ ...thread, ...updatedThread });
              }}
            />
          </div>
          <InternalNotesCard
            conversationId={thread.id}
            initialNotes={(thread as any).internal_notes}
            onUpdated={(updatedThread) => {
              setThread({ ...thread, ...updatedThread });
            }}
          />
          <LostReasonCard
            conversationId={thread.id}
            leadStage={(thread as any).lead_stage}
            initialCategory={(thread as any).lost_reason_category}
            initialDetail={(thread as any).lost_reason_detail}
            initialCompetitorName={(thread as any).lost_to_competitor_name}
            initialCompetitorBid={(thread as any).lost_to_competitor_bid}
            onUpdated={(updatedThread) => {
              setThread({ ...thread, ...updatedThread });
            }}
          />
          <ActivityTimelineCard conversationId={thread.id} />
        </div>
      </div>

      <Modal open={linkOpen} title="Link homeowner record" onClose={() => setLinkOpen(false)}>
        <div className="space-y-3 text-sm">
          <div className="text-xs text-gray-600">
            If it’s not in SmartSend, it’s not real. Linking makes this conversation tracked + assignable.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">First name</label>
              <input
                value={linkFirstName}
                onChange={(e) => setLinkFirstName(e.target.value)}
                className="w-full border rounded-lg px-2 py-1"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last name</label>
              <input
                value={linkLastName}
                onChange={(e) => setLinkLastName(e.target.value)}
                className="w-full border rounded-lg px-2 py-1"
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Email (required)</label>
            <input
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="homeowner@email.com"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="px-3 py-1 rounded-full border border-gray-300 text-xs"
              disabled={linkSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={linkSaving || !linkEmail.trim()}
              onClick={async () => {
                try {
                  setLinkSaving(true);
                  const res = await fetch(`/api/inbox/owner/threads/${encodeURIComponent(thread.id)}/link-contact`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: linkEmail.trim(),
                      first_name: linkFirstName.trim() || null,
                      last_name: linkLastName.trim() || null,
                    }),
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(json?.error || "Failed to link homeowner");
                  setLinkOpen(false);
                  setLinkFirstName("");
                  setLinkLastName("");
                  // Refresh thread to pull contact info
                  setThreadRefreshTrigger((n) => n + 1);
                } catch (e: any) {
                  alert(e?.message || "Failed to link homeowner");
                } finally {
                  setLinkSaving(false);
                }
              }}
              className="px-4 py-1 rounded-full bg-black text-white text-xs disabled:opacity-50"
            >
              {linkSaving ? "Linking…" : "Link homeowner"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

