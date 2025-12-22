"use client";

// Block 21734 — SmartSend Roofing Call Queue v1
// Call Queue Page: /call-queue
// Auto-Prioritized Call List from Hot Leads

import { useEffect, useState } from "react";

type CallTask = {
  id: string;
  lead_id: string;
  status: string;
  priority: number;
  due_at: string;
  source: string;
  notes: string | null;
  leads: {
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    status: string | null;
    heat_score: number | null;
  } | null;
};

const OUTCOME_OPTIONS = [
  { id: "completed", label: "Spoke & scheduled" },
  { id: "voicemail_left", label: "Left voicemail" },
  { id: "no_answer", label: "No answer" },
  { id: "bad_number", label: "Bad number" },
  { id: "do_not_call", label: "Do not call" },
];

export default function CallQueuePage() {
  const [tasks, setTasks] = useState<CallTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOutcome, setSelectedOutcome] = useState<string>("completed");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  async function loadQueue() {
    setLoading(true);
    try {
      const res = await fetch("/api/call-queue");
      if (res.ok) {
        const data = await res.json();
        setTasks(data || []);
      } else {
        console.error("Failed to load call queue");
      }
    } catch (error) {
      console.error("Error loading call queue:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  const current = tasks[0];

  async function submitOutcome() {
    if (!current) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/call-queue/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task_id: current.id,
          status: selectedOutcome,
          outcome_note: note,
        }),
      });

      if (res.ok) {
        setNote("");
        setShowSuccessMessage(true);
        await loadQueue();
        // Hide success message after 5 seconds
        setTimeout(() => setShowSuccessMessage(false), 5000);
      } else {
        const error = await res.json();
        console.error("Failed to update call task:", error);
        alert("Failed to update call task. Please try again.");
      }
    } catch (error) {
      console.error("Error updating call task:", error);
      alert("Error updating call task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold text-white">📞 Call Queue</h1>

      {loading && (
        <div className="text-sm text-gray-400">Loading…</div>
      )}

      {!loading && !current && (
        <div className="text-sm text-gray-400 rounded-xl bg-white/5 border border-white/10 p-6">
          No calls in the queue. SmartSend will add more as leads heat up.
        </div>
      )}

      {current && (
        <div className="grid gap-4 md:grid-cols-[2fr,1.3fr]">
          {/* Left: current call details */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-white">
                  {current.leads?.name ||
                    (current.leads?.first_name || current.leads?.last_name
                      ? `${current.leads.first_name || ""} ${current.leads.last_name || ""}`.trim()
                      : null) ||
                    current.leads?.email ||
                    "Unknown lead"}
                </div>
                <div className="text-xs text-gray-400">
                  {current.leads?.city || "Unknown city"}
                </div>
              </div>

              <div className="text-right text-xs text-gray-300">
                <div>Heat Score: {current.leads?.heat_score ?? 0}</div>
                <div>Status: {current.leads?.status?.toUpperCase() || "N/A"}</div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Source: {current.source.replace("_", " ")}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-black/40 p-3 text-sm text-gray-200">
              <div className="text-xs text-gray-400 mb-1">Phone</div>
              <div className="text-base font-mono">
                {current.leads?.phone || "No phone on file"}
              </div>
            </div>

            {current.notes && (
              <div className="rounded-lg bg-black/40 p-3 text-xs text-gray-300">
                <span className="font-semibold text-gray-200">
                  Call notes:
                </span>{" "}
                {current.notes}
              </div>
            )}

            <div className="text-xs text-gray-500">
              Tip: Call HOT leads first. This queue is already sorted by money
              (heat score + recency).
            </div>
          </div>

          {/* Right: Outcome / controls */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">
              Log Call Outcome
            </h2>

            <div className="space-y-2">
              <div className="text-xs text-gray-400">Outcome</div>
              <div className="flex flex-wrap gap-2">
                {OUTCOME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedOutcome(opt.id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      selectedOutcome === opt.id
                        ? "bg-yellow-500 text-black border-yellow-500"
                        : "bg-black text-gray-200 border-white/10 hover:border-white/20"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-400">Notes (optional)</div>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg bg-black border border-white/10 text-xs text-gray-200 p-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="E.g., left voicemail, leak is urgent, wants estimate Friday..."
              />
            </div>

            <button
              onClick={submitOutcome}
              disabled={submitting}
              className="w-full mt-2 rounded-lg bg-yellow-500 text-black text-sm font-semibold py-2 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Saving..." : "Save Outcome & Go To Next"}
            </button>

            {showSuccessMessage && (
              <div className="text-xs text-yellow-400 mt-2">
                SmartSend updated this lead based on your call. Check the timeline or call queue to see the next step.
              </div>
            )}

            <div className="text-[11px] text-gray-500">
              SmartSend will automatically move to the next best lead in your
              queue.
            </div>
          </div>
        </div>
      )}

      {/* Side list of upcoming calls */}
      {tasks.length > 1 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white mb-2">
            Up Next ({tasks.length - 1})
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tasks.slice(1).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-xs text-gray-200 border-b border-white/5 pb-1"
              >
                <div>
                  <div className="font-medium">
                    {t.leads?.name ||
                      (t.leads?.first_name || t.leads?.last_name
                        ? `${t.leads.first_name || ""} ${t.leads.last_name || ""}`.trim()
                        : null) ||
                      t.leads?.email ||
                      "Unknown"}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {t.leads?.city} • Heat {t.leads?.heat_score ?? 0}
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 capitalize">
                  {t.source.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

