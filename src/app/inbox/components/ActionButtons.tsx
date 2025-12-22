"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle, Check } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/src/components/ui/toast/ToastProvider";
import { Input } from "@/components/ui/input";
import { colors } from "../constants/colors";

interface ActionButtonsProps {
  threadId: string;
  contactPhone?: string;
  contactEmail?: string;
  onActionComplete?: () => void; // Callback to refresh thread data
}

export function ActionButtons({ threadId, contactPhone: _contactPhone, contactEmail: _contactEmail, onActionComplete }: ActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [modals, setModals] = useState<{
    markBooked: boolean;
    notAFit: boolean;
    handoff: boolean;
  }>({
    markBooked: false,
    notAFit: false,
    handoff: false,
  });

  const [bookedValue, setBookedValue] = useState("");
  const [bookedNotes, setBookedNotes] = useState("");
  const [jobType, setJobType] = useState<string>("");
  const [probability, setProbability] = useState<number>(80);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [loadingAIEstimate, setLoadingAIEstimate] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<any>(null);
  const [handoff, setHandoff] = useState<any>(null);

  const toast = useToast();

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    toast.push({
      title: message,
      type,
      duration: 3000,
    });
  };

  const loadAIEstimate = async () => {
    setLoadingAIEstimate(true);
    try {
      const response = await fetch("/api/inbox/owner/estimate-job-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI estimate");
      }

      const data = await response.json();
      setAiEstimate(data);
    } catch (error: any) {
      console.error("Error loading AI estimate:", error);
      showToast("Could not load AI estimate", "error");
    } finally {
      setLoadingAIEstimate(false);
    }
  };

  const handleAction = async (actionType: string, metadata?: any) => {
    setLoading(actionType);
    try {
      const response = await fetch("/api/inbox/owner/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          actionType,
          metadata,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to perform action");
      }

      // Show success toast
      showToast(data.message || "Action completed successfully", "success");

      // Handle specific actions
      if (actionType === "mark_booked") {
        setModals({ ...modals, markBooked: false });
        setBookedValue("");
        setBookedNotes("");
        setJobType("");
        setProbability(80);
        setExpectedCloseDate("");
        setAiEstimate(null);
        if (data?.handoff) {
          setHandoff(data.handoff);
          setModals((m) => ({ ...m, handoff: true }));
        }
        // Refresh thread data to show "Booked" badge
        onActionComplete?.();
      }
      if (actionType === "not_a_fit_exit") {
        setModals({ ...modals, notAFit: false });
        onActionComplete?.();
      }

      // Refresh thread data
      onActionComplete?.();
    } catch (error: any) {
      console.error("Error performing action:", error);
      showToast(error.message || "Failed to perform action", "error");
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* BLOCK 269600 — Forced focus: Book */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModals({ ...modals, markBooked: true })}
          disabled={loading === "mark_booked"}
          className="flex items-center gap-2 rounded-lg transition-all hover:scale-[1.03] active:scale-[0.98]"
          style={{
            borderColor: colors.actions.booked,
            color: colors.actions.booked,
          }}
        >
          <CheckCircle className="h-4 w-4" strokeWidth={2} />
          Book
        </Button>

        {/* BLOCK 270900 — Margin Protection: Not a fit exit */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModals({ ...modals, notAFit: true })}
          disabled={loading === "not_a_fit_exit"}
          className="flex items-center gap-2 rounded-lg transition-all hover:scale-[1.03] active:scale-[0.98]"
          style={{
            borderColor: "#64748b",
            color: "#334155",
          }}
        >
          ✋ Not a fit
        </Button>

        {/* BLOCK 269600 — Forced focus: Close */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction("close")}
          disabled={loading === "close"}
          className="flex items-center gap-2 rounded-lg transition-all hover:scale-[1.03] active:scale-[0.98]"
          style={{
            borderColor: "#0f172a",
            color: "#0f172a",
          }}
        >
          <Check className="h-4 w-4" strokeWidth={2} />
          Close
        </Button>
      </div>

      {/* Not a Fit Modal */}
      <Dialog
        open={modals.notAFit}
        onOpenChange={(open) => setModals({ ...modals, notAFit: open })}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send “Not a fit” exit?</DialogTitle>
            <DialogDescription>
              SmartSend will send a polite exit message and close this thread. No awkward calls, no burned bridges.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: colors.divider, backgroundColor: colors.panelBg }}>
            We may not be the best fit for this project, but I really appreciate you reaching out. Wishing you the best with it.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModals({ ...modals, notAFit: false })}>
              Cancel
            </Button>
            <Button
              onClick={() => handleAction("not_a_fit_exit")}
              disabled={loading === "not_a_fit_exit"}
            >
              {loading === "not_a_fit_exit" ? "Sending…" : "Send + close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Booked Modal */}
      <Dialog 
        open={modals.markBooked} 
        onOpenChange={(open) => {
          setModals({ ...modals, markBooked: open });
          if (open) {
            // Load AI estimate when modal opens
            loadAIEstimate();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mark as Booked</DialogTitle>
            <DialogDescription>
              Capture job details to track revenue and pipeline value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* AI Estimate Button */}
            <div className="flex items-center justify-between p-3 rounded-lg border" style={{ backgroundColor: colors.primaryLight + "20", borderColor: colors.primary }}>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: colors.ink }}>AI-Powered Estimation</p>
                <p className="text-xs" style={{ color: colors.inkSecondary }}>Get AI suggestions based on conversation</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAIEstimate}
                disabled={loadingAIEstimate}
                style={{ borderColor: colors.primary, color: colors.primary }}
              >
                {loadingAIEstimate ? "Analyzing..." : aiEstimate ? "Refresh Estimate" : "Get AI Estimate"}
              </Button>
            </div>

            {/* Show AI Estimate Results */}
            {aiEstimate && (
              <div className="p-4 rounded-lg border" style={{ backgroundColor: colors.success + "10", borderColor: colors.success }}>
                <p className="text-sm font-semibold mb-2" style={{ color: colors.success }}>AI Suggestions:</p>
                <div className="space-y-2 text-sm">
                  <p><strong>Job Type:</strong> {aiEstimate.job_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                  <p><strong>Value Range:</strong> ${aiEstimate.estimated_value_min?.toLocaleString()} - ${aiEstimate.estimated_value_max?.toLocaleString()}</p>
                  <p><strong>Probability:</strong> {aiEstimate.probability}%</p>
                  <p><strong>Expected Close:</strong> {new Date(aiEstimate.expected_close_date).toLocaleDateString()}</p>
                  <p className="text-xs mt-2 italic" style={{ color: colors.inkSecondary }}>{aiEstimate.reasoning}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setJobType(aiEstimate.job_type);
                    setBookedValue(aiEstimate.estimated_value_min?.toString() || "");
                    setProbability(aiEstimate.probability);
                    setExpectedCloseDate(aiEstimate.expected_close_date);
                  }}
                  className="mt-3"
                  style={{ borderColor: colors.success, color: colors.success }}
                >
                  Use AI Suggestions
                </Button>
              </div>
            )}

            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium mb-1">Job Type *</label>
              <select
                className="w-full px-3 py-2 border rounded-md"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                required
                style={{ borderColor: colors.divider }}
              >
                <option value="">Select job type...</option>
                <option value="roof_replacement">Roof Replacement</option>
                <option value="roof_repair">Roof Repair</option>
                <option value="storm_damage_claim">Storm Damage Claim</option>
                <option value="new_construction">New Construction</option>
                <option value="gutter_roof_package">Gutter + Roof Package</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Estimated Job Value */}
            <div>
              <label className="block text-sm font-medium mb-1">Estimated Job Value *</label>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: colors.inkSecondary }}>$</span>
                <Input
                  type="number"
                  placeholder="e.g., 15000"
                  value={bookedValue}
                  onChange={(e) => setBookedValue(e.target.value)}
                  required
                  className="flex-1"
                />
              </div>
              {aiEstimate && (
                <p className="text-xs mt-1" style={{ color: colors.inkSecondary }}>
                  Suggested range: ${aiEstimate.estimated_value_min?.toLocaleString()} - ${aiEstimate.estimated_value_max?.toLocaleString()}
                </p>
              )}
            </div>

            {/* Probability Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Probability of Closing</label>
                <span className="text-sm font-semibold" style={{ color: colors.primary }}>{probability}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={probability}
                onChange={(e) => setProbability(parseInt(e.target.value))}
                className="w-full"
                style={{ accentColor: colors.primary }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: colors.inkSecondary }}>
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Expected Close Date */}
            <div>
              <label className="block text-sm font-medium mb-1">Expected Close Date</label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <textarea
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
                placeholder="e.g., Insurance roof replacement, Small repair, Special requirements..."
                value={bookedNotes}
                onChange={(e) => setBookedNotes(e.target.value)}
                style={{ borderColor: colors.divider }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModals({ ...modals, markBooked: false })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!jobType || !bookedValue) {
                  showToast("Please fill in Job Type and Estimated Value", "error");
                  return;
                }
                handleAction("mark_booked", {
                  job_type: jobType,
                  estimated_value: parseFloat(bookedValue),
                  probability: probability,
                  expected_close_date: expectedCloseDate || null,
                  notes: bookedNotes,
                });
              }}
              disabled={loading === "mark_booked" || !jobType || !bookedValue}
            >
              Mark as Booked
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Crew-ready handoff modal (Block 271200) */}
      <Dialog
        open={modals.handoff}
        onOpenChange={(open) => setModals((m) => ({ ...m, handoff: open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crew-ready handoff</DialogTitle>
            <DialogDescription>
              Clean summary for the crew. No inbox digging.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: colors.divider, backgroundColor: colors.panelBg }}>
              <div className="font-semibold mb-1">Job type</div>
              <div className="text-gray-800">{handoff?.job_type ? String(handoff.job_type).replace(/_/g, " ") : "—"}</div>
            </div>

            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: colors.divider, backgroundColor: colors.panelBg }}>
              <div className="font-semibold mb-1">Location</div>
              <div className="text-gray-800">{handoff?.location || "—"}</div>
            </div>

            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: colors.divider, backgroundColor: colors.panelBg }}>
              <div className="font-semibold mb-1">Notes</div>
              <div className="text-gray-800 whitespace-pre-wrap">{handoff?.notes || "—"}</div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const text = [
                  "CREW HANDOFF",
                  `Job type: ${handoff?.job_type ? String(handoff.job_type).replace(/_/g, " ") : "—"}`,
                  `Location: ${handoff?.location || "—"}`,
                  `Notes: ${handoff?.notes || "—"}`,
                ].join("\n");
                navigator.clipboard?.writeText(text).catch(() => {});
                showToast("Handoff copied", "success");
              }}
            >
              Copy
            </Button>
            <Button
              onClick={() => {
                setHandoff(null);
                setModals((m) => ({ ...m, handoff: false }));
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

