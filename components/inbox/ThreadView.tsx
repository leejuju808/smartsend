"use client";

import { useEffect, useState } from "react";
import { ReplyLabels, ReplyMeetingCard } from "./ReplyLabels";
import { AiReplySuggestions } from "./AiReplySuggestions";
import { ReplyComposer } from "./ReplyComposer";

type Reply = {
  reply_id: string;
  workspace_id: string;
  lead_id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  body: string;
  metadata: any;
  received_at: string;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  lead_email: string | null;
  category: string | null;
  sentiment: string | null;
  intent_score: number | null;
  meeting_time: string | null;
  meeting_location: string | null;
  meeting_link: string | null;
  objection_type: string | null;
};

export function ThreadView({ leadId }: { leadId: string }) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultReplyBody, setDefaultReplyBody] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }

    fetch("/api/inbox/thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    })
      .then((r) => r.json())
      .then((d) => {
        setReplies(d.replies || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error loading thread:", error);
        setLoading(false);
      });
  }, [leadId]);

  const last = replies[replies.length - 1];

  const handleApplySuggestion = (body: string) => {
    setDefaultReplyBody(body);
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading thread...</div>
    );
  }

  if (replies.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No replies in this thread</div>
    );
  }

  return (
    <div className="space-y-4">
      {replies.map((r) => (
        <div key={r.reply_id} className="border rounded p-4 space-y-2">
          <ReplyLabels
            intent={{
              id: r.reply_id,
              category: r.category,
              sentiment: r.sentiment,
              intent_score: r.intent_score,
              meeting_time: r.meeting_time,
              meeting_timezone: null,
              meeting_location: r.meeting_location,
              meeting_link: r.meeting_link,
              objection_type: r.objection_type,
            }}
          />

          <div className="text-sm whitespace-pre-line">
            {r.body}
          </div>

          {r.category === "meeting" && (
            <ReplyMeetingCard
              intent={{
                id: r.reply_id,
                category: r.category,
                sentiment: r.sentiment,
                intent_score: r.intent_score,
                meeting_time: r.meeting_time,
                meeting_timezone: null,
                meeting_location: r.meeting_location,
                meeting_link: r.meeting_link,
                objection_type: r.objection_type,
              }}
            />
          )}

          <div className="text-xs text-muted-foreground">
            {new Date(r.received_at).toLocaleString()}
          </div>
        </div>
      ))}

      {last && (
        <AiReplySuggestions
          lastReplyId={last.reply_id}
          onApply={handleApplySuggestion}
        />
      )}

      <ReplyComposer leadId={leadId} defaultBody={defaultReplyBody} />
    </div>
  );
}
