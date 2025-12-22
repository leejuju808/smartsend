"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type Message = {
  id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string[];
  body_text: string | null;
  body_html: string | null;
  sent_at: string;
};

export function useThread(threadId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) return;

    let mounted = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, direction, from_email, to_email, body_text, body_html, sent_at"
        )
        .eq("thread_id", threadId)
        .order("sent_at", { ascending: true });
      if (!mounted) return;
      if (error) console.error(error);
      setMessages((data as Message[]) || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  return { messages, loading };
}

