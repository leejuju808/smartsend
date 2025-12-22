"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RepliesInbox() {
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReplies = async () => {
      const { data, error } = await supabase
        .from("email_replies")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) setReplies(data);
      setLoading(false);
    };

    fetchReplies();

    // Realtime listener
    const channel = supabase
      .channel("replies-listener")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_replies" },
        (payload) => {
          setReplies((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Helper to get preview text from body
  const getPreview = (reply: any) => {
    return reply.body_text || reply.text_body || reply.body || "(no content)";
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Replies Inbox ⚡</h2>
      <div className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : replies.length === 0 ? (
          <p className="text-muted-foreground">No replies yet.</p>
        ) : (
          replies.map((r) => (
            <div
              key={r.id}
              className="border border-border rounded-xl p-4 bg-card shadow-sm"
            >
              <p className="font-medium">{r.from_email}</p>
              <p className="text-sm text-muted-foreground">{r.subject}</p>
              <p className="mt-2">{getPreview(r)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

