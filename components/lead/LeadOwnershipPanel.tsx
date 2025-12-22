"use client";

import { useEffect, useState } from "react";

type OwnershipHistoryEntry = {
  from: string | null;
  to: string | null;
  reason: string;
  at: string;
  triggered_by?: string | null;
};

type LeadOwnership = {
  owner_id: string | null;
  ownership_mode: string;
  handoff_count: number;
  last_handoff_at: string | null;
  ownership_history: OwnershipHistoryEntry[] | null;
  owner_profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

interface LeadOwnershipPanelProps {
  leadId: string;
  lead?: LeadOwnership;
}

export function LeadOwnershipPanel({ leadId, lead: initialLead }: LeadOwnershipPanelProps) {
  const [lead, setLead] = useState<LeadOwnership | null>(initialLead || null);
  const [loading, setLoading] = useState(!initialLead);
  const [availableEstimators, setAvailableEstimators] = useState<Profile[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [selectedEstimatorId, setSelectedEstimatorId] = useState<string>("");

  useEffect(() => {
    if (!initialLead) {
      loadOwnershipData();
    }
    loadAvailableEstimators();
  }, [leadId]);

  async function loadOwnershipData() {
    try {
      const res = await fetch(`/api/leads/${leadId}/ownership`);
      if (!res.ok) throw new Error("Failed to load ownership data");
      const data = await res.json();
      setLead(data);
    } catch (err) {
      console.error("Failed to load ownership data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableEstimators() {
    try {
      const res = await fetch(`/api/estimators/list`);
      if (!res.ok) throw new Error("Failed to load estimators");
      const data = await res.json();
      setAvailableEstimators(data || []);
    } catch (err) {
      console.error("Failed to load estimators:", err);
    }
  }

  async function handleReassign() {
    if (!selectedEstimatorId) return;
    setReassigning(true);

    try {
      const res = await fetch("/api/handoff-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          new_estimator_id: selectedEstimatorId,
          reason: "manual_override",
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to reassign lead");
      }

      // Reload ownership data
      await loadOwnershipData();
      setSelectedEstimatorId("");
      alert("Lead reassigned successfully");
    } catch (err) {
      console.error("Failed to reassign lead:", err);
      alert(err instanceof Error ? err.message : "Failed to reassign lead");
    } finally {
      setReassigning(false);
    }
  }

  const getOwnershipModeBadge = (mode: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      estimator_assigned: { label: "Assigned", className: "bg-green-500/20 text-green-400" },
      unassigned: { label: "Unassigned", className: "bg-gray-500/20 text-gray-400" },
      auto_reassigned: { label: "Auto-Reassigned", className: "bg-yellow-500/20 text-yellow-400" },
      needs_owner_intervention: { label: "Needs Owner", className: "bg-red-500/20 text-red-400" },
      closed: { label: "Closed", className: "bg-gray-500/20 text-gray-500" },
    };

    const badge = badges[mode] || badges.unassigned;
    return (
      <span className={`text-xs rounded-full px-2 py-0.5 ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      missed_followups: "Missed Follow-ups",
      slow_response_hot: "Slow Response (Hot Lead)",
      stuck_stage: "Stuck in Pipeline",
      high_value_probability_drop: "High Value - Probability Drop",
      needs_owner_intervention: "Needs Owner Intervention",
      manual_override: "Manual Reassignment",
      estimator_overload: "Estimator Overload",
      estimator_inactivity: "Estimator Inactivity",
    };
    return labels[reason] || reason;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  const getProfileName = (profileId: string | null, profiles: Profile[]) => {
    if (!profileId) return "Unassigned";
    const profile = profiles.find((p) => p.id === profileId);
    return profile?.full_name || profile?.email || profileId.substring(0, 8);
  };

  if (loading) {
    return (
      <div className="p-4 bg-black/20 rounded-xl border border-white/10">
        <div className="text-sm text-gray-400">Loading ownership data...</div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-4 bg-black/20 rounded-xl border border-white/10">
        <div className="text-sm text-gray-400">No ownership data available</div>
      </div>
    );
  }

  const history = lead.ownership_history || [];
  const allProfiles = [
    ...(lead.owner_profile ? [lead.owner_profile] : []),
    ...availableEstimators,
  ];

  return (
    <div className="p-4 bg-black/20 rounded-xl border border-white/10 space-y-4">
      <h3 className="text-lg font-bold text-white">Ownership</h3>

      {/* Current Owner */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-300">
            <strong>Current Owner:</strong>{" "}
            {lead.owner_id
              ? getProfileName(lead.owner_id, allProfiles)
              : "Unassigned"}
          </div>
          {getOwnershipModeBadge(lead.ownership_mode)}
        </div>

        <div className="text-sm text-gray-300">
          <strong>Mode:</strong> {lead.ownership_mode}
        </div>

        <div className="text-sm text-gray-300">
          <strong>Handoff Count:</strong> {lead.handoff_count || 0}
        </div>

        {lead.last_handoff_at && (
          <div className="text-sm text-gray-300">
            <strong>Last Handoff:</strong> {formatDate(lead.last_handoff_at)}
          </div>
        )}
      </div>

      {/* Manual Reassignment */}
      {lead.ownership_mode !== "closed" && (
        <div className="pt-3 border-t border-white/10">
          <h4 className="font-semibold text-sm mb-2 text-gray-200">Reassign Lead</h4>
          <div className="flex gap-2">
            <select
              value={selectedEstimatorId}
              onChange={(e) => setSelectedEstimatorId(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 text-xs text-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
            >
              <option value="">Select estimator...</option>
              {availableEstimators.map((est) => (
                <option key={est.id} value={est.id}>
                  {est.full_name || est.email || est.id.substring(0, 8)}
                </option>
              ))}
            </select>
            <button
              onClick={handleReassign}
              disabled={reassigning || !selectedEstimatorId}
              className="px-3 py-1 rounded-lg bg-yellow-500 text-black text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-600 transition-colors"
            >
              {reassigning ? "Reassigning..." : "Reassign"}
            </button>
          </div>
        </div>
      )}

      {/* Handoff History */}
      <div className="pt-3 border-t border-white/10">
        <h4 className="font-semibold text-sm mb-2 text-gray-200">Handoff History</h4>
        <div className="text-xs text-gray-400 space-y-2 max-h-48 overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-gray-500">No handoffs yet.</div>
          ) : (
            history.map((h, i) => (
              <div
                key={i}
                className="rounded-lg bg-black/30 border border-white/10 p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-gray-300">
                      {getProfileName(h.from, allProfiles)} →{" "}
                      {getProfileName(h.to, allProfiles)}
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {getReasonLabel(h.reason)}
                    </div>
                  </div>
                  <div className="text-gray-500 text-[10px] whitespace-nowrap">
                    {formatDate(h.at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}









































