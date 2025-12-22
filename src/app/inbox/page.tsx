"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ThreadList } from "./components/ThreadList";
import { ConversationView } from "./components/ConversationView";
import { FilterChips } from "./components/FilterChips";
import { SearchBar } from "./components/SearchBar";
import { CarrierFilters, type Carrier } from "./components/CarrierFilters";
import { ClaimStatusFilters, type ClaimStatus } from "./components/ClaimStatusFilters";
import { LeadHeatFilters, type LeadHeat } from "./components/LeadHeatFilters";
import { JobStageFilters, type JobStage } from "./components/JobStageFilters";
import { SmartViews, type SmartView } from "./components/SmartViews";
import { InboxMetricsBar } from "./components/InboxMetricsBar";
import { MoneyMeter } from "./components/MoneyMeter";
import { PipelineTab } from "./components/PipelineTab";
import { CalendarTab } from "./components/CalendarTab";
import { ActivityFeed } from "./components/ActivityFeed";
import { useInboxRealtime } from "./hooks/useInboxRealtime";
import { Skeleton } from "@/components/ui/skeleton";
import { InboxTour } from "./components/InboxTour";
import { DemoInboxMode } from "./components/DemoInboxMode";
import { InboxLiveCard } from "./components/InboxLiveCard";
import { QuickstartChecklist } from "./components/QuickstartChecklist";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { EmptyInboxState, EmptyFilterState } from "./components/EmptyStates";
import { colors } from "./constants/colors";
import { StartOutreachButton } from "./components/StartOutreachButton";
import { FollowUpTodayPanel } from "@/components/inbox/FollowUpTodayPanel";
import { InboxOwnerHud } from "@/components/inbox/InboxOwnerHud";
import { NewLeadModal } from "@/components/inbox/NewLeadModal";
import { isCoachingUIEnabled } from "@/lib/feature-flags";

export type InboxFilter = "all" | "hot" | "warm" | "follow_up" | "dead";

export type Thread = {
  id: string;
  contactId: string | null;
  campaignId: string | null;
  workspaceId?: string | null;
  contactName: string;
  contactEmail: string;
  contactCity: string;
  contactState: string;
  contactPhone: string;
  contactAddress?: string;
  intent: string | null;
  leadScore: number | null;
  status: string;
  leadStage?: string;
  nextActionAt?: string | null;
  lastContactMethod?: string | null;
  lastContactAt?: string | null;
  assignedToUserId?: string | null;
  callNotes?: {
    address: string | null;
    issueType: string | null;
    urgency: string | null;
    generatedAt: string | null;
  } | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFrom: string;
  createdAt: string;
  updatedAt: string;
  // Block 20740 fields
  insuranceCarrier?: string | null;
  claimStatus?: string | null;
  leadHeat?: string | null;
  jobStage?: string | null;
  projectedJobValue?: number | null;
  claimNumber?: string | null;
  adjusterName?: string | null;
  adjusterPhone?: string | null;
  deductibleAmount?: number | null;
  payoutType?: string | null;
  installReady?: boolean | null;
  hasParsedScope?: boolean | null;
  proposalSent?: boolean | null;
  supplementOpportunity?: boolean | null;
  supplementSent?: boolean | null;
  adjusterContacted?: boolean | null;
  adjusterReplied?: boolean | null;
  // Block 21718: Inbox enrichment fields
  leadIntent?: string | null;
  followUpStage?: string | null;
  followUpStatus?: string | null;
  estimatedJobValue?: number | null;
  // Block 270900: Margin protection fields
  jobQualityTag?: "premium" | "standard" | "low_fit" | null;
  profitPriorityScore?: number | null;
};

export type Message = {
  id: string;
  thread_id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_raw: string;
  body_clean: string | null;
  received_at: string;
  status: string;
  ai_intent: string | null;
  lead_score: number | null;
};

export default function InboxPage() {
  const [activeTab, setActiveTab] = useState<"threads" | "pipeline" | "calendar">("threads");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [myQueueOnly, setMyQueueOnly] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Block 20740 filters
  const [carrier, setCarrier] = useState<Carrier>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>(null);
  const [leadHeat, setLeadHeat] = useState<LeadHeat>(null);
  const [jobStage, setJobStage] = useState<JobStage>(null);
  const [smartView, setSmartView] = useState<SmartView>(null);
  const [filterCounts, setFilterCounts] = useState<{
    carriers?: Record<string, number>;
    claim_statuses?: Record<string, number>;
    lead_heat?: Record<string, number>;
    job_stages?: Record<string, number>;
  }>({});

  // Tour and demo state
  const [showTour, setShowTour] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(false);
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [setupStatus, setSetupStatus] = useState<{
    hasEmailConnected: boolean;
    hasCampaigns: boolean;
    hasReplies: boolean;
    isLive: boolean;
    email: string | null;
  } | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [showNewLead, setShowNewLead] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch threads
  const fetchThreads = useCallback(async (reset = false) => {
    if (reset) {
      setOffset(0);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        filter,
        limit: "50",
        offset: reset ? "0" : offset.toString(),
      });
      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }
      if (myQueueOnly && currentUserId) {
        params.append("assigned_to", currentUserId);
      }
      // Block 20740 filters
      if (carrier) params.append("carrier", carrier);
      if (claimStatus) params.append("claim_status", claimStatus);
      if (leadHeat) params.append("lead_heat", leadHeat);
      if (jobStage) params.append("job_stage", jobStage);
      if (smartView) params.append("smart_view", smartView);

      const response = await fetch(`/api/inbox/owner/threads?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch threads");
      }

      const data = await response.json();
      
      if (reset) {
        setThreads(data.threads || []);
      } else {
        setThreads((prev) => [...prev, ...(data.threads || [])]);
      }

      setHasMore((data.threads || []).length === 50);
      if (!reset) {
        setOffset((prev) => prev + 50);
      } else {
        setOffset(50);
      }
    } catch (error) {
      console.error("Error fetching threads:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, debouncedSearch, offset, myQueueOnly, currentUserId, carrier, claimStatus, leadHeat, jobStage, smartView]);

  // Initial load and when filters/search change
  useEffect(() => {
    fetchThreads(true);
  }, [filter, debouncedSearch, myQueueOnly, carrier, claimStatus, leadHeat, jobStage, smartView]);

  // Fetch filter counts on mount
  useEffect(() => {
    const fetchFilterCounts = async () => {
      try {
        const supabase = createClientComponentClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: membership } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .single();

        if (!membership?.workspace_id) return;

        const { data, error } = await supabase.rpc("get_inbox_filter_counts", {
          p_workspace_id: membership.workspace_id,
        });

        if (!error && data) {
          setFilterCounts(data);
        }
      } catch (error) {
        console.error("Error fetching filter counts:", error);
      }
    };

    fetchFilterCounts();
  }, []);

  // Real-time updates
  useInboxRealtime({
    onNewMessage: (message) => {
      // Refresh threads when a new message arrives
      fetchThreads(true);
    },
  });

  // Check tour status and setup status on mount
  useEffect(() => {
    const checkTourAndSetup = async () => {
      const coaching = isCoachingUIEnabled();
      const supabase = createClientComponentClient();
      
      // Get user profile
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) return;

      // Set current user ID for "My Queue" filter
      setCurrentUserId(user.id);

      // Check tour status
      const { data: profile } = await supabase
        .from("profiles")
        .select("has_seen_inbox_tour, inbox_demo_dismissed")
        .eq("id", user.id)
        .maybeSingle();

      const seenTour = profile?.has_seen_inbox_tour || false;
      const dismissed = profile?.inbox_demo_dismissed || false;
      
      setHasSeenTour(seenTour);
      setDemoDismissed(dismissed);

      // Check setup status
      try {
        const response = await fetch("/api/inbox/owner/setup-status");
        if (response.ok) {
          const status = await response.json();
          setSetupStatus(status);
        }
      } catch (error) {
        console.error("Error fetching setup status:", error);
      } finally {
        setLoadingSetup(false);
      }

      // BLOCK 272500 — Internalization Sprint: no coaching UI by default.
      if (coaching && !seenTour) {
        // Small delay to ensure page is rendered
        setTimeout(() => setShowTour(true), 500);
      }
    };

    checkTourAndSetup();
  }, []);

  // Determine if we should show demo mode
  useEffect(() => {
    const coaching = isCoachingUIEnabled();
    if (coaching && !loading && threads.length === 0 && !demoDismissed && !loadingSetup) {
      setShowDemo(true);
    } else {
      setShowDemo(false);
    }
  }, [loading, threads.length, demoDismissed, loadingSetup]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchThreads(false);
    }
  };

  // Show demo mode if no threads and demo not dismissed
  if (showDemo && !loadingSetup) {
    return (
      <>
        <DemoInboxMode onDismiss={() => setDemoDismissed(true)} />
        {showTour && (
          <InboxTour
            onComplete={() => setShowTour(false)}
            onSkip={() => setShowTour(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: colors.panelBg }}>
      {/* Tour Overlay */}
      {showTour && (
        <InboxTour
          onComplete={() => setShowTour(false)}
          onSkip={() => setShowTour(false)}
        />
      )}

      {/* Top Bar */}
      <div
        className="border-b px-6 py-4"
        style={{
          backgroundColor: colors.white,
          borderColor: colors.divider,
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: colors.ink }}
            >
              Replies
            </h1>
            <p
              className="text-sm"
              style={{ color: colors.inkSecondary }}
            >
              Conversation inventory: counted, tracked, never lost.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewLead(true)}
              className="px-4 py-1.5 rounded-full bg-black text-white text-sm hover:opacity-90 transition-opacity"
            >
              + New homeowner
            </button>
            <StartOutreachButton />
          </div>
        </div>

        {/* Live Card */}
        {setupStatus?.isLive && (
          <InboxLiveCard setupStatus={setupStatus} />
        )}

        {/* Owner HUD */}
        <InboxOwnerHud />

        {/* Money Meter */}
        <MoneyMeter />

        {/* Metrics Bar */}
        <div data-tour="metrics">
          <InboxMetricsBar />
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-2 border-b" style={{ borderColor: colors.divider }}>
          <button
            onClick={() => setActiveTab("threads")}
            className="px-4 py-2 text-sm font-medium transition-all border-b-2"
            style={{
              borderBottomColor: activeTab === "threads" ? colors.primary : "transparent",
              color: activeTab === "threads" ? colors.primary : colors.inkSecondary,
            }}
          >
            Threads
          </button>
          <button
            onClick={() => setActiveTab("pipeline")}
            className="px-4 py-2 text-sm font-medium transition-all border-b-2"
            style={{
              borderBottomColor: activeTab === "pipeline" ? colors.primary : "transparent",
              color: activeTab === "pipeline" ? colors.primary : colors.inkSecondary,
            }}
          >
            Pipeline
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className="px-4 py-2 text-sm font-medium transition-all border-b-2"
            style={{
              borderBottomColor: activeTab === "calendar" ? colors.primary : "transparent",
              color: activeTab === "calendar" ? colors.primary : colors.inkSecondary,
            }}
          >
            Calendar
          </button>
        </div>

        {/* Block 20740 Filters - Only show for Threads tab */}
        {activeTab === "threads" && (
          <div className="mt-4 space-y-3" data-tour="filters">
            {/* Legacy Filter Chips */}
            <FilterChips value={filter} onChange={setFilter} />
            
            {/* Carrier Filters */}
            <CarrierFilters
              selectedCarrier={carrier}
              onCarrierChange={setCarrier}
              counts={filterCounts.carriers}
            />
            
            {/* Claim Status Filters */}
            <ClaimStatusFilters
              selectedStatus={claimStatus}
              onStatusChange={setClaimStatus}
              counts={filterCounts.claim_statuses}
            />
            
            {/* Lead Heat Filters */}
            <LeadHeatFilters
              selectedHeat={leadHeat}
              onHeatChange={setLeadHeat}
              counts={filterCounts.lead_heat}
            />
            
            {/* Job Stage Filters */}
            <JobStageFilters
              selectedStage={jobStage}
              onStageChange={setJobStage}
              counts={filterCounts.job_stages}
            />
            
            {/* Smart Views */}
            <SmartViews
              selectedView={smartView}
              onViewChange={setSmartView}
            />
          </div>
        )}

        {/* Search Bar + My Queue Toggle - Only show for Threads tab */}
        {activeTab === "threads" && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex-1">
              <SearchBar value={search} onChange={setSearch} />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={myQueueOnly}
                onChange={(e) => setMyQueueOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              My queue only
            </label>
          </div>
        )}
      </div>

      {/* Main Content - Split Pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Thread List or Pipeline (30-35% width) */}
        <div
          className="w-[35%] border-r overflow-hidden flex flex-col"
          style={{
            backgroundColor: colors.white,
            borderColor: colors.divider,
          }}
          data-tour="thread-list"
        >
          {activeTab === "threads" ? (
            <>
              {loading && threads.length === 0 ? (
                <div className="p-4 space-y-2 overflow-y-auto">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <EmptyInboxState />
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto">
                    <ThreadList
                      threads={threads}
                      selectedThreadId={selectedThreadId}
                      onSelectThread={setSelectedThreadId}
                    />
                  </div>
                  {hasMore && (
                    <div
                      className="p-4 border-t"
                      style={{ borderColor: colors.divider }}
                    >
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="w-full rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                        style={{
                          backgroundColor: colors.primaryLight,
                          color: colors.primary,
                          border: `1px solid ${colors.primary}`,
                        }}
                      >
                        {loadingMore ? "Loading..." : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : activeTab === "pipeline" ? (
            <PipelineTab onThreadSelect={setSelectedThreadId} />
          ) : (
            <CalendarTab onThreadSelect={setSelectedThreadId} />
          )}
        </div>

        {/* Right Panel - Split between Conversation & Activity Feed */}
        <div className="flex flex-1 overflow-hidden">
          {/* Conversation & Lead Details (60% width) */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ backgroundColor: colors.panelBg }}
            data-tour="lead-detail"
          >
            {selectedThreadId ? (
              <ConversationView threadId={selectedThreadId} />
            ) : (
              <div
                className="flex items-center justify-center h-full"
                style={{ color: colors.inkSecondary }}
              >
                <p>Select a thread to view conversation</p>
              </div>
            )}
          </div>

          {/* Right Sidebar - Follow-Up Panel & Activity Feed */}
          <div className="w-[25%] border-l overflow-y-auto" style={{ backgroundColor: colors.panelBg }}>
            <div className="p-4 space-y-4">
              <FollowUpTodayPanel />
              <ActivityFeed
                onThreadSelect={(threadId) => setSelectedThreadId(threadId)}
              />
            </div>
          </div>

          {/* Quickstart Checklist */}
          {setupStatus && !setupStatus.hasReplies && (
            <QuickstartChecklist setupStatus={setupStatus} />
          )}
        </div>
      </div>

      {/* New Lead Modal */}
      <NewLeadModal
        open={showNewLead}
        onClose={() => setShowNewLead(false)}
        onCreated={(conversation) => {
          // Transform conversation to Thread format and prepend to list
          const newThread: Thread = {
            id: conversation.id,
            contactId: conversation.contact_id || null,
            campaignId: conversation.campaign_id || null,
            contactName: conversation.homeowner_name || "Unknown",
            contactEmail: conversation.homeowner_email || "",
            contactCity: "",
            contactState: "",
            contactPhone: conversation.homeowner_phone || "",
            intent: null,
            leadScore: conversation.engagement_score || null,
            status: conversation.status || "open",
            leadStage: conversation.lead_stage,
            nextActionAt: conversation.next_action_at,
            lastContactMethod: conversation.last_contact_method,
            lastContactAt: conversation.last_contact_at,
            assignedToUserId: conversation.assigned_to_user_id,
            lastMessageAt: conversation.last_message_at || conversation.created_at,
            lastMessagePreview: conversation.internal_notes || "",
            lastMessageFrom: conversation.homeowner_email || "",
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
          };
          setThreads((prev) => [newThread, ...prev]);
          setSelectedThreadId(newThread.id);
          setShowNewLead(false);
        }}
      />
    </div>
  );
}
