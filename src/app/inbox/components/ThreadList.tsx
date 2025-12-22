"use client";

import { Thread } from "../page";
import { IntentBadge } from "./IntentBadge";
import { formatTimestamp } from "../utils/formatTimestamp";
import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";
import { TaskIndicator } from "@/components/tasks/TaskIndicator";
import { useEffect, useState } from "react";

interface ThreadListProps {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

interface ThreadTaskCounts {
  [threadId: string]: {
    open: number;
    overdue: number;
    dueToday: number;
    allCompleted: boolean;
  };
}

function getIntentColor(intent: string | null): string {
  if (!intent) return colors.divider;
  
  const intentLower = intent.toLowerCase();
  switch (intentLower) {
    case "hot":
      return colors.intent.hot;
    case "warm":
      return colors.intent.warm;
    case "follow_up":
    case "follow-up":
      return colors.intent.followUp;
    case "dead":
    case "cold":
      return colors.intent.dead;
    default:
      return colors.divider;
  }
}

// Block 21718: Helper functions for inbox enrichment badges
function getIntentBadgeClass(intent: string | null): string {
  if (!intent) return "border-muted bg-muted/50 text-muted-foreground";
  
  const intentLower = intent.toLowerCase();
  switch (intentLower) {
    case "hot":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    case "warm":
      return "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-200";
    case "not_interested":
      return "border-slate-500/50 bg-slate-500/10 text-slate-700 dark:text-slate-200";
    default:
      return "border-muted bg-muted/50 text-muted-foreground";
  }
}

function formatFollowUpStage(stage: string | null | undefined): string {
  if (!stage || stage === "none") return "none";
  return stage.replace("fu_", "stage ");
}

function formatFollowUpStatus(status: string | null | undefined): string {
  if (!status) return "active";
  return status.replace(/_/g, " ");
}

function formatJobQualityTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const t = String(tag).toLowerCase();
  if (t === "premium") return "Premium";
  if (t === "low_fit" || t === "low-fit" || t === "low fit") return "Low-fit";
  if (t === "standard") return "Standard";
  return null;
}

export function ThreadList({
  threads,
  selectedThreadId,
  onSelectThread,
}: ThreadListProps) {
  const [taskCounts, setTaskCounts] = useState<ThreadTaskCounts>({});

  // Fetch task counts for threads
  useEffect(() => {
    if (threads.length === 0) return;

    const fetchTaskCounts = async () => {
      try {
        const threadIds = threads.map((t) => t.id);
        const res = await fetch("/api/tasks/v2/thread-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadIds }),
        });

        if (res.ok) {
          const data = await res.json();
          setTaskCounts(data.counts || {});
        }
      } catch (error) {
        console.error("Error fetching task counts:", error);
      }
    };

    fetchTaskCounts();
  }, [threads]);

  return (
    <div className="divide-y" style={{ borderColor: colors.divider }}>
      {threads.map((thread) => {
        const isSelected = selectedThreadId === thread.id;
        const isUnread = thread.status === "open";
        const isUnlinked = !thread.contactId;
        const intentColor = getIntentColor(thread.intent);
        const jobQualityLabel = formatJobQualityTag(thread.jobQualityTag);
        const taskInfo = taskCounts[thread.id] || {
          open: 0,
          overdue: 0,
          dueToday: 0,
          allCompleted: true,
        };

        return (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={cn(
              "w-full text-left relative transition-all duration-150 ease-out",
              "hover:bg-opacity-50",
              isSelected && "bg-opacity-100"
            )}
            style={{
              backgroundColor: isSelected 
                ? colors.primaryLight 
                : isUnread 
                  ? `${colors.panelBg}80` 
                  : "transparent",
            }}
          >
            {/* Colored vertical bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: intentColor }}
            />
            
            {/* Block 21718: Lead Intent Dot */}
            {thread.leadIntent && (
              <div
                className="absolute left-2 top-4 h-2.5 w-2.5 rounded-full flex-none"
                style={{ 
                  backgroundColor: thread.leadIntent === "hot" ? "#10b981" :
                                  thread.leadIntent === "warm" ? "#f59e0b" :
                                  thread.leadIntent === "not_interested" ? "#6b7280" :
                                  "#9ca3af"
                }}
              />
            )}
            
            {/* Unread blue dot */}
            {isUnread && !thread.leadIntent && (
              <div
                className="absolute left-2 top-4 h-2 w-2 rounded-full"
                style={{ backgroundColor: colors.primary }}
              />
            )}

            {/* Main content */}
            <div className="pl-6 pr-4 py-4">
              {/* Top line: Name + Badges */}
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={cn(
                      "truncate text-sm",
                      isUnread ? "font-semibold" : "font-medium"
                    )}
                    style={{ color: colors.ink }}
                  >
                    {thread.contactName}
                  </span>
                  {/* BLOCK 271000 — Default Reality Sprint: unlinked conversations are not "real" yet */}
                  {isUnlinked && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold border"
                      style={{
                        backgroundColor: "#fff1f2",
                        color: "#9f1239",
                        borderColor: "#fecdd3",
                      }}
                      title="This conversation is not linked to a homeowner record yet."
                    >
                      UNLINKED
                    </span>
                  )}
                  {/* Block 270900: Job Quality Tag */}
                  {jobQualityLabel && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold border"
                      style={{
                        backgroundColor:
                          jobQualityLabel === "Premium"
                            ? "#dcfce7"
                            : jobQualityLabel === "Low-fit"
                              ? "#f1f5f9"
                              : "#eef2ff",
                        color:
                          jobQualityLabel === "Premium"
                            ? "#166534"
                            : jobQualityLabel === "Low-fit"
                              ? "#334155"
                              : "#3730a3",
                        borderColor:
                          jobQualityLabel === "Premium"
                            ? "#86efac"
                            : jobQualityLabel === "Low-fit"
                              ? "#cbd5e1"
                              : "#c7d2fe",
                      }}
                      title="SmartSend job quality"
                    >
                      {jobQualityLabel === "Premium" && "💰 "}
                      {jobQualityLabel === "Low-fit" && "✋ "}
                      {jobQualityLabel}
                    </span>
                  )}
                  {/* Block 20740: Lead Heat Badge */}
                  {thread.leadHeat && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: 
                          thread.leadHeat === "HOT" ? "#fee2e2" :
                          thread.leadHeat === "WARM" ? "#fef3c7" :
                          thread.leadHeat === "NURTURE" ? "#dbeafe" :
                          thread.leadHeat === "COLD" ? "#e0e7ff" :
                          "#f3f4f6",
                        color:
                          thread.leadHeat === "HOT" ? "#991b1b" :
                          thread.leadHeat === "WARM" ? "#92400e" :
                          thread.leadHeat === "NURTURE" ? "#1e40af" :
                          thread.leadHeat === "COLD" ? "#3730a3" :
                          "#6b7280",
                      }}
                    >
                      {thread.leadHeat === "HOT" && "🔥"}
                      {thread.leadHeat === "WARM" && "⚡"}
                      {thread.leadHeat === "NURTURE" && "📩"}
                      {thread.leadHeat === "COLD" && "❄️"}
                      {thread.leadHeat === "NOT_A_FIT" && "❌"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <TaskIndicator
                    openTasksCount={taskInfo.open}
                    overdueTasksCount={taskInfo.overdue}
                    dueTodayTasksCount={taskInfo.dueToday}
                    allCompleted={taskInfo.allCompleted}
                  />
                  <IntentBadge intent={thread.intent} size="sm" />
                  {thread.leadScore !== null && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium border"
                      style={{
                        backgroundColor: colors.primaryLight,
                        color: colors.primary,
                        borderColor: colors.primary,
                      }}
                    >
                      {thread.leadScore}
                    </span>
                  )}
                </div>
              </div>

              {/* Block 21718: Inbox Enrichment Badges Row */}
              {(thread.leadIntent || thread.followUpStage || thread.followUpStatus || thread.estimatedJobValue) && (
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {/* Lead Intent Badge */}
                  {thread.leadIntent && (
                    <span
                      className={cn(
                        "h-5 rounded-sm px-2 text-[10px] capitalize border",
                        getIntentBadgeClass(thread.leadIntent)
                      )}
                    >
                      {thread.leadIntent === "unknown" 
                        ? "Lead intent: unknown" 
                        : `${thread.leadIntent} lead`}
                    </span>
                  )}
                  
                  {/* Follow-up Status + Stage Badge */}
                  {(thread.followUpStage || thread.followUpStatus) && (
                    <span
                      className="h-5 rounded-sm px-2 text-[10px] capitalize border text-muted-foreground"
                      style={{
                        borderColor: colors.divider,
                        backgroundColor: colors.neutralLight,
                        color: colors.inkSecondary,
                      }}
                    >
                      {formatFollowUpStatus(thread.followUpStatus)} · {formatFollowUpStage(thread.followUpStage)}
                    </span>
                  )}
                  
                  {/* Money Badge */}
                  {thread.estimatedJobValue && thread.estimatedJobValue > 0 && (
                    <span
                      className="h-5 rounded-sm px-2 text-[10px] font-semibold border"
                      style={{
                        backgroundColor: "#dcfce7",
                        color: "#166534",
                        borderColor: "#86efac",
                      }}
                    >
                      ≈ ${Math.round(thread.estimatedJobValue).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              {/* Block 20740: Carrier, Claim Status, Job Stage Info */}
              {(thread.insuranceCarrier || thread.claimStatus || thread.jobStage || thread.projectedJobValue) && (
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {thread.insuranceCarrier && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: colors.neutralLight,
                        color: colors.inkSecondary,
                      }}
                    >
                      {thread.insuranceCarrier}
                    </span>
                  )}
                  {thread.claimStatus && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: 
                          thread.claimStatus === "approved" ? "#dcfce7" :
                          thread.claimStatus === "denied" ? "#fee2e2" :
                          thread.claimStatus === "adjuster_visit_scheduled" ? "#dbeafe" :
                          colors.neutralLight,
                        color:
                          thread.claimStatus === "approved" ? "#166534" :
                          thread.claimStatus === "denied" ? "#991b1b" :
                          thread.claimStatus === "adjuster_visit_scheduled" ? "#1e40af" :
                          colors.inkSecondary,
                      }}
                    >
                      {thread.claimStatus === "no_claim_filed" && "No Claim"}
                      {thread.claimStatus === "claim_filed_awaiting_adjuster" && "Claim Filed"}
                      {thread.claimStatus === "adjuster_visit_scheduled" && "Adjuster Scheduled"}
                      {thread.claimStatus === "under_review" && "Under Review"}
                      {thread.claimStatus === "approved" && "Approved (RCV)"}
                      {thread.claimStatus === "approved_acv_only" && "Approved (ACV)"}
                      {thread.claimStatus === "supplements_needed" && "Supplements Needed"}
                      {thread.claimStatus === "denied" && "Denied"}
                    </span>
                  )}
                  {thread.jobStage && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: colors.neutralLight,
                        color: colors.inkSecondary,
                      }}
                    >
                      {thread.jobStage.replace(/_/g, " ")}
                    </span>
                  )}
                  {thread.projectedJobValue && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: "#dcfce7",
                        color: "#166534",
                        fontWeight: 600,
                      }}
                    >
                      ${(thread.projectedJobValue / 1000).toFixed(1)}k
                    </span>
                  )}
                  {thread.installReady && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: "#fef3c7",
                        color: "#92400e",
                        fontWeight: 600,
                      }}
                    >
                      🔥 Install Ready
                    </span>
                  )}
                </div>
              )}

              {/* Bottom line: Preview + Timestamp */}
              <div className="flex items-start justify-between gap-3">
                <p
                  className={cn(
                    "text-sm line-clamp-2 flex-1",
                    isUnread && "font-medium"
                  )}
                  style={{ color: colors.inkSecondary }}
                >
                  {thread.lastMessagePreview || "No preview"}
                </p>
                <span
                  className="text-xs flex-shrink-0 ml-2 whitespace-nowrap"
                  style={{ color: colors.neutral }}
                >
                  {formatTimestamp(thread.lastMessageAt)}
                </span>
              </div>
            </div>

            {/* Active row accent border */}
            {isSelected && (
              <div
                className="absolute left-0 top-0 bottom-0 w-0.5"
                style={{ backgroundColor: colors.primary }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

