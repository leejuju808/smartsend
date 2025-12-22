// Block 300 — Adaptive Reply Brain v2
// Reply Intent Labels Component

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Link as LinkIcon } from "lucide-react";

export interface ReplyIntent {
  id: string;
  category: string | null;
  sentiment: string | null;
  intent_score: number | null;
  meeting_time: string | null;
  meeting_timezone: string | null;
  meeting_location: string | null;
  meeting_link: string | null;
  objection_type: string | null;
}

interface ReplyLabelsProps {
  intent: ReplyIntent | null | undefined;
}

const CATEGORY_COLORS: Record<string, string> = {
  meeting: "bg-blue-600 text-white",
  positive: "bg-emerald-600 text-white",
  negative: "bg-rose-600 text-white",
  neutral: "bg-slate-600 text-white",
  referral: "bg-purple-600 text-white",
  out_of_office: "bg-amber-600 text-white",
  unsubscribe: "bg-zinc-800 text-white border border-zinc-700",
  objection: "bg-orange-600 text-white",
  wrong_person: "bg-gray-500 text-white",
  bounce: "bg-red-700 text-white",
  spam: "bg-red-800 text-white",
  ambiguous: "bg-gray-400 text-white",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800 border border-green-300",
  neutral: "bg-gray-100 text-gray-800 border border-gray-300",
  negative: "bg-red-100 text-red-800 border border-red-300",
};

function getScoreColor(score: number | null): string {
  if (score === null) return "bg-gray-100 text-gray-800";
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 40) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export function ReplyLabels({ intent }: ReplyLabelsProps) {
  if (!intent) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {intent.category && (
        <Badge
          className={`px-2 py-1 rounded text-xs font-medium ${
            CATEGORY_COLORS[intent.category] || "bg-gray-500 text-white"
          }`}
        >
          {intent.category}
        </Badge>
      )}

      {intent.sentiment && (
        <Badge
          className={`px-2 py-1 rounded text-xs font-medium ${
            SENTIMENT_COLORS[intent.sentiment] || "bg-gray-100 text-gray-800"
          }`}
        >
          {intent.sentiment}
        </Badge>
      )}

      {intent.intent_score !== null && (
        <Badge
          className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(intent.intent_score)}`}
        >
          Score: {intent.intent_score}
        </Badge>
      )}

      {intent.objection_type && (
        <Badge className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
          Objection: {intent.objection_type}
        </Badge>
      )}
    </div>
  );
}

export function ReplyMeetingCard({ intent }: { intent: ReplyIntent | null | undefined }) {
  if (!intent || intent.category !== "meeting") return null;

  const formatTime = (timeStr: string | null, timezone: string | null) => {
    if (!timeStr) return "Not specified";
    try {
      const date = new Date(timeStr);
      return date.toLocaleString(undefined, {
        timeZone: timezone || undefined,
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return timeStr;
    }
  };

  return (
    <div className="p-3 border rounded bg-muted/50 text-sm space-y-2 mt-2">
      <div className="font-medium flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Meeting Detected
      </div>
      
      {intent.meeting_time && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Time:</div>
          <div className="font-medium">
            {formatTime(intent.meeting_time, intent.meeting_timezone)}
            {intent.meeting_timezone && (
              <span className="text-xs text-muted-foreground ml-1">
                ({intent.meeting_timezone})
              </span>
            )}
          </div>
        </div>
      )}

      {intent.meeting_location && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Location:</div>
          <div className="font-medium flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {intent.meeting_location}
          </div>
        </div>
      )}

      {intent.meeting_link && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Link:</div>
          <a
            href={intent.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium flex items-center gap-1 text-blue-600 hover:underline"
          >
            <LinkIcon className="h-3 w-3" />
            {intent.meeting_link}
          </a>
        </div>
      )}
    </div>
  );
}








