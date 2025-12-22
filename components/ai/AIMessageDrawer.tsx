"use client";

import { useState } from "react";
import clsx from "clsx";
import { X, Sparkles, Send, Copy, Check } from "lucide-react";

type MessageType =
  | "followup"
  | "soft_reengagement"
  | "proposal_send"
  | "photo_request"
  | "tone_reset"
  | "job_save"
  | "insurance_question"
  | "timeline_question";

type GeneratedMessage = {
  subject?: string | null;
  message: string;
  recommended_delay_minutes: number;
};

type Props = {
  leadId: string;
  leadName?: string;
  open: boolean;
  onClose: () => void;
  onSend?: (message: GeneratedMessage) => void;
};

const MESSAGE_TYPES: { value: MessageType; label: string; description: string }[] = [
  { value: "followup", label: "Follow-Up", description: "Quick check-in or follow-up message" },
  {
    value: "soft_reengagement",
    label: "Soft Re-Engagement",
    description: "Gentle nudge for leads who haven't responded",
  },
  { value: "proposal_send", label: "Send Proposal", description: "Message to accompany a proposal" },
  { value: "photo_request", label: "Photo Request", description: "Ask for roof or damage photos" },
  { value: "tone_reset", label: "Tone Reset", description: "Reset tone after frustration or miscommunication" },
  { value: "job_save", label: "Job Save", description: "Recovery message for at-risk jobs" },
  { value: "insurance_question", label: "Insurance Question", description: "Ask about insurance status or claim" },
  { value: "timeline_question", label: "Timeline Question", description: "Ask about timeline or next steps" },
];

export function AIMessageDrawer({ leadId, leadName, open, onClose, onSend }: Props) {
  const [messageType, setMessageType] = useState<MessageType>("followup");
  const [generated, setGenerated] = useState<GeneratedMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateMessage() {
    setLoading(true);
    setError(null);
    setGenerated(null);

    try {
      const res = await fetch("/api/generate-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: leadId,
          message_type: messageType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate message");
      }

      const data = await res.json();
      setGenerated(data);
    } catch (err: any) {
      console.error("Error generating message:", err);
      setError(err.message || "Failed to generate message. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!generated) return;
    const textToCopy = generated.subject
      ? `${generated.subject}\n\n${generated.message}`
      : generated.message;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSend() {
    if (!generated || !onSend) return;
    onSend(generated);
  }

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
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">AI Message Builder</h2>
              {leadName && <p className="text-sm text-zinc-400">{leadName}</p>}
            </div>
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
          {/* Message Type Selector */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-300">Message Type</label>
            <select
              value={messageType}
              onChange={(e) => {
                setMessageType(e.target.value as MessageType);
                setGenerated(null);
                setError(null);
              }}
              className="w-full bg-black/30 rounded-lg p-3 border border-white/10 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {MESSAGE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-400">
              {MESSAGE_TYPES.find((t) => t.value === messageType)?.description}
            </p>
          </div>

          {/* Generate Button */}
          <button
            onClick={generateMessage}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate Message</span>
              </>
            )}
          </button>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Generated Message */}
          {generated && (
            <div className="space-y-4">
              <div className="p-4 bg-white/5 border border-white/10 rounded-lg space-y-3">
                {generated.subject && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 mb-1">Subject:</p>
                    <p className="text-sm text-zinc-200 font-medium">{generated.subject}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-2">Message:</p>
                  <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-normal">
                    {generated.message}
                  </pre>
                </div>
                {generated.recommended_delay_minutes > 0 && (
                  <p className="text-xs text-zinc-400">
                    Recommended delay: {generated.recommended_delay_minutes} minutes
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                {onSend && (
                  <button
                    onClick={handleSend}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    <span>Send Message</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300">
              <strong>SmartSend AI</strong> generates messages using your lead's full intelligence:
              job health, momentum, experience score, risk state, next action, and homeowner tone.
              Each message is personalized, local, and roofing-specific.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}









































