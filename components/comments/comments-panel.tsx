"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CommentsPanel({ context, id }: { context: "lead" | "thread" | "campaign"; id: string }) {
  const { data, mutate } = useSWR(`/api/comments/${context}/${id}`, fetcher);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      const payload: any = {
        body: text,
        mentions: extractMentions(text),
      };

      if (context === "lead") {
        payload.lead_id = id;
      } else if (context === "thread") {
        payload.thread_id = id;
      } else if (context === "campaign") {
        payload.campaign_id = id;
      }

      await fetch(`/api/comments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setText("");
      mutate();
    } catch (err) {
      console.error("Failed to add comment:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Comments</h3>
      
      <div className="space-y-2">
        {data?.comments?.length > 0 ? (
          data.comments.map((c: any) => (
            <div key={c.id} className="p-3 bg-muted rounded text-sm">
              <p className="whitespace-pre-wrap">{c.body}</p>
              <p className="text-xs opacity-50 mt-1">
                {c.user?.email || "Unknown"} • {new Date(c.created_at).toLocaleString()}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No comments yet</p>
        )}
      </div>

      <Textarea
        placeholder="Write a comment… (@mention teammates)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="text-sm"
      />

      <Button onClick={submit} size="sm" disabled={submitting || !text.trim()}>
        {submitting ? "Adding..." : "Add Comment"}
      </Button>
    </div>
  );
}

function extractMentions(body: string): string[] {
  const regex = /@([a-zA-Z0-9_.-]+)/g;
  const matches = [...body.matchAll(regex)];
  // Return user IDs (for now, just return the matched usernames)
  // In a real implementation, you'd resolve usernames to user IDs
  return matches.map((m) => m[1]);
}










