// Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
// Component: Call History for Lead Profile
// Shows call timeline with intent classification and SMS replies

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CallHistoryItem = {
  id: string;
  phone: string;
  event: string;
  duration: number | null;
  voicemail_url: string | null;
  created_at: string;
  intent: string | null;
  confidence: number | null;
  reply_text: string | null;
  sms_sent: boolean;
  sms_replied: boolean;
  score_boost: number | null;
};

export function CallHistory({ leadId }: { leadId: string }) {
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leads/${leadId}/calls`);
        if (res.ok) {
          const data = await res.json();
          setCalls(data.calls || []);
        }
      } catch (error) {
        console.error("Error loading call history:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leadId]);

  if (loading) {
    return (
      <div className="border rounded-lg p-4">
        <div className="text-sm text-gray-500">Loading call history…</div>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-2">Call History</h3>
        <div className="text-sm text-gray-500">No calls logged for this lead</div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="font-semibold">Call History</h3>
      <div className="space-y-3">
        {calls.map((call) => (
          <CallHistoryItem key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}

function CallHistoryItem({ call }: { call: CallHistoryItem }) {
  const eventColors: Record<string, string> = {
    missed: "bg-red-100 text-red-800 border-red-200",
    answered: "bg-emerald-100 text-emerald-800 border-emerald-200",
    completed: "bg-blue-100 text-blue-800 border-blue-200",
    voicemail: "bg-purple-100 text-purple-800 border-purple-200",
    incoming: "bg-gray-100 text-gray-800 border-gray-200",
  };

  const intentLabels: Record<string, string> = {
    emergency_leak: "Emergency Leak",
    repair_request: "Repair Request",
    full_replacement: "Full Replacement",
    storm_damage: "Storm Damage",
    general_question: "General Question",
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs font-medium rounded border ${
              eventColors[call.event] || eventColors.incoming
            }`}
          >
            {call.event}
          </span>
          <span className="text-sm text-gray-600">{call.phone}</span>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(call.created_at).toLocaleString()}
        </span>
      </div>

      {/* Details */}
      <div className="text-sm space-y-1">
        {call.duration && (
          <div className="text-gray-600">Duration: {call.duration}s</div>
        )}

        {call.sms_sent && (
          <div className="flex items-center gap-2">
            <span className="text-emerald-600">✓</span>
            <span className="text-gray-600">SmartSend auto-texted back</span>
          </div>
        )}

        {call.sms_replied && call.reply_text && (
          <div className="bg-gray-50 rounded p-2 mt-2">
            <div className="text-xs text-gray-500 mb-1">Customer replied:</div>
            <div className="text-sm">{call.reply_text}</div>
          </div>
        )}

        {call.intent && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">Intent:</span>
            <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
              {intentLabels[call.intent] || call.intent}
            </span>
            {call.confidence && (
              <span className="text-xs text-gray-500">
                ({Math.round(call.confidence * 100)}% confidence)
              </span>
            )}
          </div>
        )}

        {call.score_boost && (
          <div className="text-xs text-emerald-600 mt-1">
            +{call.score_boost} lead score boost
          </div>
        )}

        {call.voicemail_url && (
          <div className="mt-2">
            <audio controls className="w-full h-8">
              <source src={call.voicemail_url} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
}


































