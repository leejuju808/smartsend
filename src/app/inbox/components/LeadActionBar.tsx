// Block 20170 — Lead Action Bar + Assignment

"use client";

import { useState, useEffect } from "react";

type LeadStage = "new" | "working" | "scheduled" | "won" | "lost";

interface LeadActionBarProps {
  conversationId: string;
  initialStage: LeadStage;
  initialNextActionAt?: string | null;
  initialAssigneeId?: string | null;
  onUpdated?: (payload: any) => void;
}

interface TeamMember {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

interface FollowUpSettings {
  default_follow_up_days_small: number;
  default_follow_up_days_medium: number;
  default_follow_up_days_long: number;
}

export function LeadActionBar({
  conversationId,
  initialStage,
  initialNextActionAt,
  initialAssigneeId,
  onUpdated,
}: LeadActionBarProps) {
  const [stage, setStage] = useState<LeadStage>(initialStage);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | undefined>(
    initialAssigneeId || undefined
  );
  const [followUpDays, setFollowUpDays] = useState<FollowUpSettings>({
    default_follow_up_days_small: 1,
    default_follow_up_days_medium: 3,
    default_follow_up_days_long: 7,
  });

  // Sync assigneeId when initialAssigneeId prop changes
  useEffect(() => {
    setAssigneeId(initialAssigneeId || undefined);
  }, [initialAssigneeId]);

  // Load team members once
  useEffect(() => {
    async function loadMembers() {
      setLoadingMembers(true);
      try {
        const res = await fetch("/api/team/members");
        const json = await res.json();
        setMembers(json.members ?? []);
      } catch (err) {
        console.error("Failed to load team members", err);
      } finally {
        setLoadingMembers(false);
      }
    }
    loadMembers();
  }, []);

  // Load follow-up settings from account settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/inbox/settings-account");
        if (res.ok) {
          const json = await res.json();
          if (json.settings) {
            setFollowUpDays({
              default_follow_up_days_small: json.settings.default_follow_up_days_small || 1,
              default_follow_up_days_medium: json.settings.default_follow_up_days_medium || 3,
              default_follow_up_days_long: json.settings.default_follow_up_days_long || 7,
            });
          }
        }
      } catch (error) {
        console.error("Error loading follow-up settings:", error);
        // Use defaults if fetch fails
      }
    }
    loadSettings();
  }, []);

  async function updateLead(
    patch: Partial<{
      lead_stage: LeadStage;
      next_action_at: string;
      log_contact: boolean;
      last_contact_method: string;
      assigned_to_user_id: string | null;
    }>
  ) {
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/lead/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          ...patch,
        }),
      });

      const data = await res.json();
      setSaving(false);

      if (data?.conversation && onUpdated) {
        onUpdated(data.conversation);
      }

      if (data?.conversation?.lead_stage) {
        setStage(data.conversation.lead_stage as LeadStage);
      }

      if ("assigned_to_user_id" in patch) {
        setAssigneeId(patch.assigned_to_user_id ?? undefined);
      }
    } catch (error) {
      console.error("Error updating lead:", error);
      setSaving(false);
    }
  }

  function scheduleFollowUp(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    updateLead({ next_action_at: d.toISOString() });
  }

  function handleChangeAssignee(value: string) {
    if (value === "unassigned") {
      updateLead({ assigned_to_user_id: null });
    } else {
      updateLead({ assigned_to_user_id: value });
    }
  }

  const assigneeLabel = (() => {
    if (!assigneeId) return "Unassigned";
    const found = members.find((m) => m.id === assigneeId);
    if (!found) return "Assigned";
    return found.full_name || found.email || "Assigned";
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-3">
      {/* Left: stage selector + assignee */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Lead stage</span>
          <select
            value={stage}
            onChange={(e) =>
              updateLead({ lead_stage: e.target.value as LeadStage })
            }
            className="border rounded-lg px-2 py-1 text-xs bg-white"
            disabled={saving}
          >
            <option value="new">New</option>
            <option value="working">Working</option>
            <option value="scheduled">Scheduled</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Assigned to</span>
          <select
            value={assigneeId || "unassigned"}
            onChange={(e) => handleChangeAssignee(e.target.value)}
            className="border rounded-lg px-2 py-1 text-xs bg-white"
            disabled={saving || loadingMembers}
          >
            <option value="unassigned">
              {loadingMembers ? "Loading team…" : "Unassigned"}
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email || m.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Middle: quick actions */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          onClick={() =>
            updateLead({
              lead_stage: "working",
              log_contact: true,
              last_contact_method: "phone",
            })
          }
          disabled={saving}
          className="px-3 py-1 rounded-full border border-gray-300 hover:border-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📞 Call logged
        </button>

        <button
          onClick={() =>
            updateLead({
              lead_stage: "scheduled",
            })
          }
          disabled={saving}
          className="px-3 py-1 rounded-full border border-gray-300 hover:border-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📅 Estimate scheduled
        </button>

        <button
          onClick={() => updateLead({ lead_stage: "won" })}
          disabled={saving}
          className="px-3 py-1 rounded-full border border-emerald-400 text-emerald-700 hover:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✅ Job won
        </button>

        <button
          onClick={() => updateLead({ lead_stage: "lost" })}
          disabled={saving}
          className="px-3 py-1 rounded-full border border-red-300 text-red-600 hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ❌ Lost
        </button>
      </div>

      {/* Right: follow-ups + saving indicator */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Follow up</span>
        <button
          onClick={() => scheduleFollowUp(followUpDays.default_follow_up_days_small)}
          disabled={saving}
          className="px-2 py-1 rounded-full border border-gray-300 hover:border-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +{followUpDays.default_follow_up_days_small} {followUpDays.default_follow_up_days_small === 1 ? 'day' : 'days'}
        </button>
        <button
          onClick={() => scheduleFollowUp(followUpDays.default_follow_up_days_medium)}
          disabled={saving}
          className="px-2 py-1 rounded-full border border-gray-300 hover:border-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +{followUpDays.default_follow_up_days_medium} days
        </button>
        <button
          onClick={() => scheduleFollowUp(followUpDays.default_follow_up_days_long)}
          disabled={saving}
          className="px-2 py-1 rounded-full border border-gray-300 hover:border-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +{followUpDays.default_follow_up_days_long} days
        </button>

        {saving && (
          <span className="text-gray-400 text-[10px]">Saving…</span>
        )}
      </div>
    </div>
  );
}

