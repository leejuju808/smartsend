// Block 19600 — SmartSend Owner Inbox v1
// Lead card right panel with AI summary, recommended response, lead value, follow-up timer

"use client";

import { useEffect, useState } from "react";
import InboxActionButtons from "./InboxActionButtons";

interface LeadCard {
  homeownerName: string;
  homeownerEmail: string;
  phone: string | null;
  address: string | null;
  messageThread: any[];
  aiSummary: string | null;
  recommendedResponse: string | null;
  leadValueRange: string;
  followUpTimerHours: number | null;
  leadRankingScore: number;
  aiIntentTag: string | null;
  tags: string[];
}

interface InboxLeadCardProps {
  threadId: string;
  onClose: () => void;
}

export default function InboxLeadCard({ threadId, onClose }: InboxLeadCardProps) {
  const [loading, setLoading] = useState(true);
  const [leadCard, setLeadCard] = useState<LeadCard | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    loadLeadCard();
  }, [threadId]);

  async function loadLeadCard() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/replies/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setLeadCard(data.leadCard);
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error loading lead card:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-200 rounded w-1/3"></div>
          <div className="h-4 bg-neutral-200 rounded w-2/3"></div>
          <div className="h-32 bg-neutral-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!leadCard) {
    return (
      <div className="p-6 text-center text-neutral-400">
        <p>Lead card not found</p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-red-600";
    if (score >= 60) return "text-orange-600";
    if (score >= 40) return "text-yellow-600";
    return "text-blue-600";
  };

  const getIntentLabel = (intent: string | null) => {
    const labels: Record<string, string> = {
      hot_lead: "Hot Lead",
      warm_lead: "Warm Lead",
      cold_lead: "Cold Lead",
      dead_lead: "Not Interested",
      follow_up_needed: "Follow-Up Needed",
    };
    return intent ? labels[intent] || intent : "Unknown";
  };

  const formatFollowUpTimer = (hours: number | null) => {
    if (!hours) return null;
    if (hours < 1) return "Respond ASAP";
    if (hours < 24) return `Respond within ${hours} hours`;
    const days = Math.floor(hours / 24);
    return `Respond within ${days} day${days > 1 ? "s" : ""}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-neutral-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              {leadCard.homeownerName}
            </h2>
            <p className="text-sm text-neutral-500 mt-1">{leadCard.homeownerEmail}</p>
            {leadCard.phone && (
              <p className="text-sm text-neutral-500 mt-1">📞 {leadCard.phone}</p>
            )}
            {leadCard.address && (
              <p className="text-sm text-neutral-500 mt-1">📍 {leadCard.address}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>

        {/* Lead Score & Intent */}
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-neutral-500">Lead Score</span>
            <div className={`text-2xl font-bold ${getScoreColor(leadCard.leadRankingScore)}`}>
              {leadCard.leadRankingScore}
            </div>
          </div>
          {leadCard.aiIntentTag && (
            <div>
              <span className="text-xs text-neutral-500">Intent</span>
              <div className="text-sm font-semibold text-neutral-700">
                {getIntentLabel(leadCard.aiIntentTag)}
              </div>
            </div>
          )}
          {leadCard.leadValueRange && (
            <div>
              <span className="text-xs text-neutral-500">Value Range</span>
              <div className="text-sm font-semibold text-neutral-700">
                {leadCard.leadValueRange}
              </div>
            </div>
          )}
        </div>

        {/* Follow-Up Timer */}
        {leadCard.followUpTimerHours && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-yellow-600 font-semibold">⏰</span>
              <span className="text-sm font-medium text-yellow-800">
                {formatFollowUpTimer(leadCard.followUpTimerHours)}
              </span>
              {leadCard.leadRankingScore >= 80 && (
                <span className="text-xs text-yellow-600 ml-auto">
                  → 80% win rate if responded quickly
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-b border-neutral-200">
        <InboxActionButtons threadId={threadId} />
      </div>

      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Message Thread</h3>
        <div className="space-y-4">
          {messages.map((message, idx) => (
            <div
              key={message.id || idx}
              className={`p-4 rounded-lg ${
                message.direction === "in"
                  ? "bg-neutral-50 border border-neutral-200"
                  : "bg-blue-50 border border-blue-200 ml-8"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-neutral-700">
                  {message.direction === "in" ? leadCard.homeownerName : "You"}
                </span>
                <span className="text-xs text-neutral-500">
                  {new Date(message.sent_at || message.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-neutral-700 whitespace-pre-wrap">
                {message.body || message.body_text || "(No content)"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Summary & Recommended Response */}
      <div className="p-6 border-t border-neutral-200 bg-neutral-50">
        {leadCard.aiSummary && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-neutral-700 mb-2">AI Summary</h4>
            <p className="text-sm text-neutral-600">{leadCard.aiSummary}</p>
          </div>
        )}
        {leadCard.recommendedResponse && (
          <div>
            <h4 className="text-sm font-semibold text-neutral-700 mb-2">Recommended Response</h4>
            <div className="p-3 bg-white border border-neutral-200 rounded-lg">
              <p className="text-sm text-neutral-700">{leadCard.recommendedResponse}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



















































