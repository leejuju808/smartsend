"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { X, Phone, Sparkles } from "lucide-react";
import { LogCallModal } from "@/components/calls/LogCallModal";
import { PipelineAttachments } from "./PipelineAttachments";
import { AIMessageDrawer } from "@/components/ai/AIMessageDrawer";

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  tags: string[] | null;
  pipeline_stage: string;
  inspection_at: string | null;
  inspection_notes: string | null;
  inspection_assigned_to: string | null;
  estimate_amount: number | null;
  estimate_sent_at: string | null;
  estimate_pdf_url: string | null;
  job_value: number | null;
  job_won_at: string | null;
  job_notes: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  contact: Contact;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
};

const STAGES = [
  { id: "new_lead", name: "New Lead" },
  { id: "inspection", name: "Inspection Scheduled" },
  { id: "estimate_sent", name: "Estimate Sent" },
  { id: "job_won", name: "Job Won" },
] as const;

export function LeadDetailDrawer({ contact, open, onClose, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Inspection form state
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");

  // Estimate form state
  const [estimateAmount, setEstimateAmount] = useState("");
  const [estimatePdfUrl, setEstimatePdfUrl] = useState("");

  // Job won form state
  const [jobValue, setJobValue] = useState("");
  const [jobNotes, setJobNotes] = useState("");

  // Stage selector
  const [selectedStage, setSelectedStage] = useState(contact.pipeline_stage);

  // Log call modal state
  const [logCallModalOpen, setLogCallModalOpen] = useState(false);

  // Initialize form values from contact
  useEffect(() => {
    if (contact.inspection_at) {
      const date = new Date(contact.inspection_at);
      setInspectionDate(date.toISOString().split("T")[0]);
      setInspectionTime(date.toTimeString().slice(0, 5));
    } else {
      setInspectionDate("");
      setInspectionTime("");
    }
    setInspectionNotes(contact.inspection_notes || "");
    setEstimateAmount(contact.estimate_amount?.toString() || "");
    setEstimatePdfUrl(contact.estimate_pdf_url || "");
    setJobValue(contact.job_value?.toString() || "");
    setJobNotes(contact.job_notes || "");
    setSelectedStage(contact.pipeline_stage);
  }, [contact]);

  const handleStageChange = async (newStage: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData: any = {};

      // Prepare data based on stage
      if (newStage === "inspection") {
        if (inspectionDate && inspectionTime) {
          const inspectionDateTime = new Date(
            `${inspectionDate}T${inspectionTime}`
          ).toISOString();
          updateData.inspection_at = inspectionDateTime;
        }
        if (inspectionNotes) {
          updateData.inspection_notes = inspectionNotes;
        }
      } else if (newStage === "estimate_sent") {
        if (estimateAmount) {
          updateData.estimate_amount = parseFloat(estimateAmount);
          updateData.estimate_sent_at = new Date().toISOString();
        }
        if (estimatePdfUrl) {
          updateData.estimate_pdf_url = estimatePdfUrl;
        }
      } else if (newStage === "job_won") {
        if (jobValue) {
          updateData.job_value = parseFloat(jobValue);
          updateData.job_won_at = new Date().toISOString();
        }
        if (jobNotes) {
          updateData.job_notes = jobNotes;
        }
      }

      const res = await fetch("/api/pipeline/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          stage: newStage,
          data: updateData,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update stage");
      }

      setSelectedStage(newStage);
      setSuccess("Stage updated successfully!");
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      onUpdate();
    } catch (err: any) {
      setError(err.message || "Failed to update stage");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInspection = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const inspectionDateTime =
        inspectionDate && inspectionTime
          ? new Date(`${inspectionDate}T${inspectionTime}`).toISOString()
          : null;

      const res = await fetch("/api/pipeline/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          stage: "inspection",
          data: {
            inspection_at: inspectionDateTime,
            inspection_notes: inspectionNotes,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save inspection");
      }

      setSuccess("Inspection saved!");
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      onUpdate();
    } catch (err: any) {
      setError(err.message || "Failed to save inspection");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEstimate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/pipeline/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          stage: "estimate_sent",
          data: {
            estimate_amount: estimateAmount ? parseFloat(estimateAmount) : null,
            estimate_sent_at: estimateAmount ? new Date().toISOString() : null,
            estimate_pdf_url: estimatePdfUrl || null,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save estimate");
      }

      setSuccess("Estimate saved!");
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      onUpdate();
    } catch (err: any) {
      setError(err.message || "Failed to save estimate");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJobWon = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/pipeline/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          stage: "job_won",
          data: {
            job_value: jobValue ? parseFloat(jobValue) : null,
            job_won_at: jobValue ? new Date().toISOString() : null,
            job_notes: jobNotes || null,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save job won");
      }

      setSuccess("Job won saved!");
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      onUpdate();
    } catch (err: any) {
      setError(err.message || "Failed to save job won");
    } finally {
      setLoading(false);
    }
  };

  const displayName =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email || "Unknown";

  if (!open) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Backdrop */}
      <div
        className={clsx(
          "absolute inset-0 bg-black/60 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={clsx(
          "absolute inset-y-0 right-0 w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-xl transform transition-transform overflow-y-auto",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{displayName}</h2>
            {contact.email && (
              <p className="text-sm text-zinc-400">{contact.email}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Contact Info */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Contact Info</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {contact.phone && (
                <div>
                  <span className="text-zinc-500">Phone:</span>{" "}
                  <span className="text-zinc-300">{contact.phone}</span>
                </div>
              )}
              {contact.company && (
                <div>
                  <span className="text-zinc-500">Company:</span>{" "}
                  <span className="text-zinc-300">{contact.company}</span>
                </div>
              )}
            </div>
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {contact.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs rounded-full px-2 py-1 bg-zinc-800 text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline Stage Selector */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Pipeline Stage</h3>
            <select
              value={selectedStage}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          {/* Log Phone Call */}
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-semibold text-zinc-300">Phone Calls</h3>
            <button
              onClick={() => setLogCallModalOpen(true)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
            >
              <Phone className="h-4 w-4" />
              Log Phone Call
            </button>
          </div>

          {/* AI Message Builder */}
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-semibold text-zinc-300">AI Message Builder</h3>
            <button
              onClick={() => setAiMessageDrawerOpen(true)}
              className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Generate AI Message
            </button>
          </div>

          {/* Inspection Section */}
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-semibold text-zinc-300">
              Inspection Scheduled
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Date</label>
                <input
                  type="date"
                  value={inspectionDate}
                  onChange={(e) => setInspectionDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Time</label>
                <input
                  type="time"
                  value={inspectionTime}
                  onChange={(e) => setInspectionTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <textarea
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                placeholder="Add inspection notes..."
              />
            </div>
            <button
              onClick={handleSaveInspection}
              disabled={loading}
              className={clsx(
                "w-full rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                loading
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              )}
            >
              {loading ? "Saving..." : "Save Inspection"}
            </button>
            
            {/* Inspection Attachments */}
            <PipelineAttachments contactId={contact.id} linkedTo="inspection" />
          </div>

          {/* Estimate Section */}
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-semibold text-zinc-300">Estimate Sent</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Estimate Amount ($)
              </label>
              <input
                type="number"
                value={estimateAmount}
                onChange={(e) => setEstimateAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Estimate PDF URL (optional)
              </label>
              <input
                type="url"
                value={estimatePdfUrl}
                onChange={(e) => setEstimatePdfUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleSaveEstimate}
              disabled={loading}
              className={clsx(
                "w-full rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                loading
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-amber-500 text-white hover:bg-amber-600"
              )}
            >
              {loading ? "Saving..." : "Save Estimate"}
            </button>
            
            {/* Estimate Attachments */}
            <PipelineAttachments contactId={contact.id} linkedTo="estimate" />
          </div>

          {/* Job Won Section */}
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-semibold text-zinc-300">Job Won</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Final Job Value ($)
              </label>
              <input
                type="number"
                value={jobValue}
                onChange={(e) => setJobValue(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Job Notes</label>
              <textarea
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                placeholder="Add job notes..."
              />
            </div>
            <button
              onClick={handleSaveJobWon}
              disabled={loading}
              className={clsx(
                "w-full rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                loading
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-emerald-500 text-white hover:bg-emerald-600"
              )}
            >
              {loading ? "Saving..." : "Save Job Won"}
            </button>
            
            {/* Job Won Attachments */}
            <PipelineAttachments contactId={contact.id} linkedTo="job_won" />
          </div>

          {/* Status Messages */}
          {error && (
            <div className="rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-4 py-2 text-sm text-emerald-400">
              {success}
            </div>
          )}
        </div>
      </div>

      {/* Log Call Modal */}
      <LogCallModal
        open={logCallModalOpen}
        onClose={() => setLogCallModalOpen(false)}
        onCallLogged={() => {
          setLogCallModalOpen(false);
          onUpdate(); // Refresh the drawer data
        }}
        contactId={contact.id}
        defaultPhone={contact.phone || undefined}
      />

      {/* AI Message Drawer */}
      <AIMessageDrawer
        leadId={contact.id}
        leadName={
          contact.first_name || contact.last_name
            ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
            : contact.email || "Unknown"
        }
        open={aiMessageDrawerOpen}
        onClose={() => setAiMessageDrawerOpen(false)}
        onSend={(message) => {
          // Handle sending the message (you can implement this later)
          console.log("Message to send:", message);
          setAiMessageDrawerOpen(false);
        }}
      />
    </div>
  );
}


