// Block 22126 — SmartSend Roofing Homeowner Transcript v1
// TranscriptBubble: Individual message bubble component
// Displays message with tone, intent, and sentiment badges

"use client";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export interface TranscriptMessage {
  id: string;
  lead_id: string;
  workspace_id: string;
  sender_type: "homeowner" | "estimator" | "system" | "ai";
  sender_name: string | null;
  message_text: string;
  tone: string | null;
  intent: string | null;
  sentiment_score: number | null;
  experience_impact: number | null;
  source_type: string | null;
  source_id: string | null;
  thread_id: string | null;
  created_at: string;
}

interface TranscriptBubbleProps {
  message: TranscriptMessage;
}

const TONE_EMOJIS: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  confused: "🤔",
  impatient: "⏰",
  angry: "😠",
  "price-shopping": "💰",
  "scheduling-focused": "📅",
  appreciation: "🙏",
};

const INTENT_EMOJIS: Record<string, string> = {
  "high intent": "🔥",
  "medium intent": "⭐",
  "low intent": "💤",
  "not interested": "❌",
  "needs clarification": "❓",
  "ready to book": "✅",
  "wants price": "💵",
  stalling: "⏸️",
};

const TONE_COLORS: Record<string, string> = {
  positive: "bg-green-500/20 text-green-400 border-green-500/30",
  neutral: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  confused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  impatient: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  angry: "bg-red-500/20 text-red-400 border-red-500/30",
  "price-shopping": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "scheduling-focused": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  appreciation: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

interface TranscriptBubbleProps {
  message: TranscriptMessage;
  timelineMarkers?: Array<{ emoji: string; label: string; color: string }>;
}

export function TranscriptBubble({ message, timelineMarkers = [] }: TranscriptBubbleProps) {
  const isHomeowner = message.sender_type === "homeowner";
  const isEstimator = message.sender_type === "estimator";
  const isAI = message.sender_type === "ai";
  const isSystem = message.sender_type === "system";

  // Determine sender display name
  const senderDisplayName =
    message.sender_name ||
    (isHomeowner ? "Homeowner" : isEstimator ? "Estimator" : isAI ? "AI Assistant" : "System");

  // Format timestamp
  const timestamp = format(new Date(message.created_at), "MMM d, h:mm a");

  // Get sentiment color
  const getSentimentColor = (score: number | null) => {
    if (score === null) return "";
    if (score >= 75) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  // Get experience impact indicator
  const getExperienceImpact = (impact: number | null) => {
    if (impact === null) return null;
    if (impact > 0) return { text: `+${impact}`, color: "text-green-400" };
    if (impact < 0) return { text: `${impact}`, color: "text-red-400" };
    return null;
  };

  const experienceImpact = getExperienceImpact(message.experience_impact);

  return (
    <div className={cn("flex mb-4 relative", isHomeowner ? "justify-start" : "justify-end")}>
      {/* Timeline markers on the left */}
      {timelineMarkers.length > 0 && (
        <div className="absolute -left-12 top-0 flex flex-col gap-1">
          {timelineMarkers.map((marker, idx) => (
            <div
              key={idx}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm border",
                marker.color,
                "bg-gray-800/50 border-gray-700"
              )}
              title={marker.label}
            >
              {marker.emoji}
            </div>
          ))}
        </div>
      )}
      <div className={cn("max-w-[70%] flex flex-col", isHomeowner ? "items-start" : "items-end")}>
        {/* Sender name and timestamp */}
        <div className="flex items-center gap-2 mb-1 text-xs text-gray-400">
          <span className="font-semibold">{senderDisplayName}</span>
          <span>•</span>
          <span>{timestamp}</span>
          {message.source_type && (
            <>
              <span>•</span>
              <span className="uppercase text-[10px]">{message.source_type}</span>
            </>
          )}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm shadow-sm",
            isHomeowner
              ? "bg-white/10 border border-white/20 text-gray-100 rounded-tl-sm"
              : isEstimator
              ? "bg-blue-600 text-white rounded-tr-sm"
              : isAI
              ? "bg-purple-600/80 text-white rounded-tr-sm"
              : "bg-gray-700/50 text-gray-300 rounded-tr-sm"
          )}
          style={{
            borderRadius: isHomeowner ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
          }}
        >
          {/* Message text */}
          <div className="whitespace-pre-wrap leading-relaxed">{message.message_text}</div>

          {/* Intelligence badges */}
          {(message.tone || message.intent || message.sentiment_score !== null || experienceImpact) && (
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
              {message.tone && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-2 py-0.5 border",
                    TONE_COLORS[message.tone] || "bg-gray-500/20 text-gray-400 border-gray-500/30"
                  )}
                >
                  {TONE_EMOJIS[message.tone] || "🗣️"} {message.tone}
                </Badge>
              )}
              {message.intent && (
                <Badge
                  variant="outline"
                  className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-2 py-0.5"
                >
                  {INTENT_EMOJIS[message.intent] || "🎯"} {message.intent}
                </Badge>
              )}
              {message.sentiment_score !== null && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-2 py-0.5 border",
                    getSentimentColor(message.sentiment_score),
                    "bg-gray-500/20 border-gray-500/30"
                  )}
                >
                  😊 {message.sentiment_score}
                </Badge>
              )}
              {experienceImpact && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-2 py-0.5 border",
                    experienceImpact.color,
                    "bg-gray-500/20 border-gray-500/30"
                  )}
                >
                  📊 {experienceImpact.text}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

