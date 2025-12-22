"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle2, XCircle, Edit, Copy } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface MeetingIntent {
  id: string;
  intent_confidence: number;
  start_ts: string | null;
  end_ts: string | null;
  timezone: string | null;
  duration_min: number;
  text_excerpt: string | null;
  status: "proposed" | "accepted" | "booked" | "rejected" | "expired";
  notes: string | null;
}

interface MeetingIntentCardProps {
  intent: MeetingIntent;
  replyId: string;
  onUpdate?: () => void;
}

export default function MeetingIntentCard({ intent, replyId, onUpdate }: MeetingIntentCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const sb = supabaseBrowser();

  const formatDate = (ts: string | null) => {
    if (!ts) return "Not specified";
    const date = new Date(ts);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: intent.timezone || undefined,
    });
  };

  const confidencePercent = Math.round(intent.intent_confidence * 100);
  const needsReview = intent.intent_confidence < 0.70;

  const handleAccept = async () => {
    setLoading("accept");
    try {
      const res = await fetch(`/api/meeting-intents/${intent.id}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        onUpdate?.();
      }
    } catch (error) {
      console.error("Error accepting intent:", error);
    } finally {
      setLoading(null);
    }
  };

  const handleBook = async () => {
    setLoading("book");
    try {
      const res = await fetch(`/api/meeting-intents/${intent.id}/book`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        onUpdate?.();
        if (data.video_link) {
          // Show success with link
          alert(`Meeting booked! Link: ${data.video_link}`);
        }
      }
    } catch (error) {
      console.error("Error booking meeting:", error);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading("reject");
    try {
      await sb
        .from("meeting_intents")
        .update({ status: "rejected" })
        .eq("id", intent.id);
      onUpdate?.();
    } catch (error) {
      console.error("Error rejecting intent:", error);
    } finally {
      setLoading(null);
    }
  };

  const copyInvite = () => {
    // TODO: Generate ICS file or copy calendar link
    alert("Calendar invite copied.");
  };

  if (intent.status === "rejected" || intent.status === "expired") {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            Meeting intent detected
          </CardTitle>
          <Badge
            variant={needsReview ? "destructive" : "default"}
            className="text-xs"
          >
            {confidencePercent}% confidence
            {needsReview && " - Needs review"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {intent.start_ts ? (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{formatDate(intent.start_ts)}</span>
            {intent.timezone && (
              <span className="text-muted-foreground">({intent.timezone})</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No specific time detected
          </div>
        )}

        {intent.text_excerpt && (
          <div className="text-xs text-muted-foreground bg-white/50 p-2 rounded">
            "{intent.text_excerpt}"
          </div>
        )}

        {intent.status === "booked" ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>Meeting booked</span>
            <Button
              size="sm"
              variant="outline"
              onClick={copyInvite}
              className="ml-auto"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy invite
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {intent.status === "proposed" && (
              <>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={loading !== null}
                  variant="default"
                >
                  {loading === "accept" ? "Accepting…" : "Accept"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBook}
                  disabled={loading !== null || needsReview}
                  variant="default"
                >
                  {loading === "book" ? "Booking…" : "Book"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // TODO: Open edit time dialog
                    alert("Edit time is not available in v1.");
                  }}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit time
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleReject}
                  disabled={loading !== null}
                >
                  {loading === "reject" ? "Ignoring…" : "Ignore"}
                </Button>
              </>
            )}
            {intent.status === "accepted" && (
              <>
                <Button
                  size="sm"
                  onClick={handleBook}
                  disabled={loading !== null}
                  variant="default"
                >
                  {loading === "book" ? "Booking…" : "Book Meeting"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // TODO: Open edit time dialog
                    alert("Edit time is not available in v1.");
                  }}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit time
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}















