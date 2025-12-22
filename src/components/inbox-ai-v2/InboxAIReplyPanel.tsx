/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * AI Reply Panel Component
 * 
 * Shows AI-generated reply drafts with:
 * - Intent label and confidence
 * - Multiple reply variants
 * - One-tap send for Speed Lead Mode
 * - Booking suggestions
 */

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getThreadDrafts, getBookingSuggestions } from "@/lib/inboxAiV2/queries";

interface InboxAIReplyPanelProps {
  threadId: string;
  messageId: string;
  intentLabel: string;
  onSend?: (draftId: string) => void;
  onApprove?: (draftId: string) => void;
}

export default function InboxAIReplyPanel({
  threadId,
  messageId,
  intentLabel,
  onSend,
  onApprove
}: InboxAIReplyPanelProps) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [bookingSuggestions, setBookingSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadDrafts();
    if (intentLabel === "inspection_scheduling" || intentLabel === "hot_lead") {
      loadBookingSuggestions();
    }
  }, [threadId, messageId, intentLabel]);

  async function loadDrafts() {
    setLoading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const threadDrafts = await getThreadDrafts(supabase, threadId);
      setDrafts(threadDrafts);
      if (threadDrafts.length > 0) {
        setSelectedDraft(threadDrafts[0].id);
      }
    } catch (error) {
      console.error("Error loading drafts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadBookingSuggestions() {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const suggestions = await getBookingSuggestions(supabase, threadId);
      setBookingSuggestions(suggestions);
    } catch (error) {
      console.error("Error loading booking suggestions:", error);
    }
  }

  async function handleSend() {
    if (!selectedDraft) return;

    setSending(true);
    try {
      // Call API to send draft
      const response = await fetch(`/api/inbox-ai-v2/send-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: selectedDraft })
      });

      if (!response.ok) {
        throw new Error("Failed to send draft");
      }

      onSend?.(selectedDraft);
    } catch (error) {
      console.error("Error sending draft:", error);
      alert("Failed to send reply. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleBookAppointment(time: string) {
    if (!bookingSuggestions) return;

    try {
      const response = await fetch(`/api/inbox-ai-v2/booking-suggestions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId: bookingSuggestions.id,
          bookedTime: time
        })
      });

      if (!response.ok) {
        throw new Error("Failed to book appointment");
      }

      alert("Appointment booked successfully!");
      await loadBookingSuggestions();
    } catch (error) {
      console.error("Error booking appointment:", error);
      alert("Failed to book appointment. Please try again.");
    }
  }

  const intentConfig = {
    hot_lead: { emoji: "🔥", label: "HOT LEAD", color: "bg-red-100 text-red-800" },
    warm_lead: { emoji: "🟧", label: "Warm Lead", color: "bg-orange-100 text-orange-800" },
    quote_request: { emoji: "💵", label: "Quote Request", color: "bg-yellow-100 text-yellow-800" },
    inspection_scheduling: { emoji: "📅", label: "Scheduling", color: "bg-blue-100 text-blue-800" },
    appointment_confirmed: { emoji: "✔️", label: "Confirmed", color: "bg-green-100 text-green-800" },
    cold_reply: { emoji: "❄️", label: "Cold Reply", color: "bg-gray-100 text-gray-800" },
    not_interested: { emoji: "🚫", label: "Not Interested", color: "bg-gray-100 text-gray-600" }
  };

  const config = intentConfig[intentLabel as keyof typeof intentConfig] || intentConfig.warm_lead;
  const isHotLead = intentLabel === "hot_lead";

  if (loading) {
    return (
      <div className="p-4 border rounded-lg">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <p className="text-sm text-gray-600">No AI drafts available. Generate one?</p>
        <button
          onClick={() => {
            // Trigger draft generation
            fetch(`/api/inbox-ai-v2/generate-reply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageId, threadId, intentLabel, messageText: "" })
            }).then(() => loadDrafts());
          }}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          Generate Draft
        </button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className={`px-4 py-3 ${config.color} rounded-t-lg flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{config.emoji}</span>
          <span className="font-semibold">{config.label}</span>
          {drafts[0]?.confidence && (
            <span className="text-xs opacity-75">
              {Math.round(drafts[0].confidence * 100)}% confidence
            </span>
          )}
        </div>
        {isHotLead && (
          <div className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">
            SPEED LEAD MODE
          </div>
        )}
      </div>

      {/* Drafts */}
      <div className="p-4 space-y-4">
        {drafts.map((draft, index) => (
          <div
            key={draft.id}
            className={`border rounded-lg p-4 cursor-pointer transition-colors ${
              selectedDraft === draft.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => setSelectedDraft(draft.id)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">
                Variant {draft.variant_number}
              </div>
              {selectedDraft === draft.id && (
                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <div className="text-sm text-gray-900 whitespace-pre-wrap">
              {draft.draft_body}
            </div>
          </div>
        ))}

        {/* Booking Suggestions */}
        {bookingSuggestions && bookingSuggestions.suggested_times && (
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Suggested Times:</h4>
            <div className="space-y-2">
              {bookingSuggestions.suggested_times.map((suggestion: any, index: number) => (
                <button
                  key={index}
                  onClick={() => handleBookAppointment(suggestion.time)}
                  className="w-full px-4 py-2 text-left border rounded hover:bg-blue-50 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-900">{suggestion.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={handleSend}
            disabled={!selectedDraft || sending}
            className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
              isHotLead
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {sending ? "Sending..." : isHotLead ? "🚀 Send Now (Speed Lead)" : "Send Reply"}
          </button>
          <button
            onClick={() => selectedDraft && onApprove?.(selectedDraft)}
            className="px-4 py-2 border rounded hover:bg-gray-50 text-sm"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}






































