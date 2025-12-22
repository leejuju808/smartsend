"use client";

import { useState, useEffect } from "react";
import { Clock, Sparkles, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { colors } from "../constants/colors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TimeSuggestion {
  suggested_start_time: string;
  suggested_end_time: string;
  confidence_score: number;
  suggestion_reason: string;
  storm_event_id?: string;
}

interface SmartSuggestTimesProps {
  threadId?: string;
  contactId?: string;
  jobType?: string;
  severity?: string;
  urgency?: string;
  locationZip?: string;
  onSelectTime: (startTime: string, endTime: string) => void;
}

export function SmartSuggestTimes({
  threadId,
  contactId,
  jobType,
  severity,
  urgency,
  locationZip,
  onSelectTime,
}: SmartSuggestTimesProps) {
  const [suggestions, setSuggestions] = useState<TimeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (threadId || contactId) {
      fetchSuggestions();
    }
  }, [threadId, contactId, jobType, severity, urgency, locationZip]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inbox/calendar/suggest-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          contact_id: contactId,
          job_type: jobType,
          severity,
          urgency,
          location_zip: locationZip,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch suggestions");
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      console.error("Error fetching time suggestions:", err);
      setError(err.message || "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 border rounded-lg" style={{ borderColor: colors.divider }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 animate-pulse" style={{ color: colors.primary }} />
          <span className="text-sm font-medium" style={{ color: colors.ink }}>
            Generating smart suggestions...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg" style={{ borderColor: colors.divider }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#EF4444" }}>
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load suggestions: {error}</span>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="p-4 border rounded-lg space-y-3" style={{ borderColor: colors.divider, backgroundColor: colors.primaryLight + "10" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: colors.primary }} />
        <span className="text-sm font-semibold" style={{ color: colors.ink }}>
          Smart Time Suggestions
        </span>
      </div>

      <div className="space-y-2">
        {suggestions.map((suggestion, index) => {
          const startTime = parseISO(suggestion.suggested_start_time);
          const endTime = parseISO(suggestion.suggested_end_time);
          const confidence = suggestion.confidence_score || 0;

          return (
            <div
              key={index}
              className="p-3 border rounded-lg hover:shadow-md transition-all cursor-pointer"
              style={{
                borderColor: colors.divider,
                backgroundColor: colors.white,
              }}
              onClick={() => onSelectTime(suggestion.suggested_start_time, suggestion.suggested_end_time)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4" style={{ color: colors.inkSecondary }} />
                    <span className="text-sm font-medium" style={{ color: colors.ink }}>
                      {format(startTime, "EEEE, MMM d")} at {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: colors.inkSecondary }}>
                    {suggestion.suggestion_reason}
                  </p>
                  {suggestion.storm_event_id && (
                    <Badge variant="outline" style={{ borderColor: "#EF4444", color: "#EF4444" }} className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Storm Related
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    style={{
                      backgroundColor: confidence > 0.8 ? "#10B981" : confidence > 0.6 ? "#3B82F6" : "#F59E0B",
                      color: "white",
                    }}
                    className="text-xs"
                  >
                    {Math.round(confidence * 100)}% confidence
                  </Badge>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    style={{ backgroundColor: colors.primary, color: "white" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTime(suggestion.suggested_start_time, suggestion.suggested_end_time);
                    }}
                  >
                    Select
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



















































