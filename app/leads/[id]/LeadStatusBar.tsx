"use client";

import { useState } from "react";

type LeadStatus = "open" | "in_progress" | "won" | "lost" | "do_not_contact";

interface LeadStatusBarProps {
  leadId: string;
  initialStatus: LeadStatus;
  initialNextFollowUpAt: string | null;
}

export function LeadStatusBar({
  leadId,
  initialStatus,
  initialNextFollowUpAt,
}: LeadStatusBarProps) {
  const [status, setStatus] = useState<LeadStatus>(initialStatus);
  const [nextFollowUpAt, setNextFollowUpAt] = useState<string | "">(
    initialNextFollowUpAt
      ? toLocalInputValue(initialNextFollowUpAt)
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toLocalInputValue(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  function toIsoFromLocalInput(value: string) {
    if (!value) return null;
    const d = new Date(value);
    return d.toISOString();
  }

  async function updateLead(update: {
    status?: LeadStatus;
    next_follow_up_at?: string | null;
  }) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update lead");
      }

      const json = await res.json();
      if (json.status) setStatus(json.status as LeadStatus);
      if (json.next_follow_up_at) {
        setNextFollowUpAt(toLocalInputValue(json.next_follow_up_at));
      }

      setMessage("Saved");
      setTimeout(() => setMessage(null), 1500);
    } catch (err: any) {
      console.error("Error updating lead:", err);
      setMessage(err.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  }

  function handleStatusClick(next: LeadStatus) {
    updateLead({ status: next });
  }

  function handleFollowUpChange(value: string) {
    setNextFollowUpAt(value);
    const iso = toIsoFromLocalInput(value);
    updateLead({ next_follow_up_at: iso });
  }

  function scheduleTomorrow() {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0); // tomorrow at 9AM
    const local = toLocalInputValue(now.toISOString());
    setNextFollowUpAt(local);
    const iso = toIsoFromLocalInput(local);
    updateLead({ next_follow_up_at: iso });
  }

  const statusOptions: LeadStatus[] = [
    "open",
    "in_progress",
    "won",
    "lost",
    "do_not_contact",
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Status
          </span>
          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-200">
            {status.replace(/_/g, " ")}
          </span>
          {message && (
            <span className="text-[0.7rem] text-neutral-400">{message}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {statusOptions.map((option) => (
            <button
              key={option}
              type="button"
              disabled={saving}
              onClick={() => handleStatusClick(option)}
              className={`rounded-full px-3 py-1 ${
                status === option
                  ? "bg-neutral-100 text-neutral-900"
                  : "border border-neutral-700 text-neutral-300"
              }`}
            >
              {option === "do_not_contact"
                ? "Do Not Contact"
                : option === "in_progress"
                ? "In Progress"
                : option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 text-xs">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Next Follow-Up
        </span>
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={nextFollowUpAt}
            onChange={(e) => handleFollowUpChange(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-100 outline-none"
          />
          <button
            type="button"
            onClick={scheduleTomorrow}
            disabled={saving}
            className="rounded-xl border border-neutral-700 px-3 py-1 text-xs text-neutral-200"
          >
            + Tomorrow 9AM
          </button>
        </div>
        <span className="text-[0.7rem] text-neutral-500">
          This controls the Follow-Up Queue.
        </span>
      </div>
    </div>
  );
}

























































