"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import MeetingIntentCard from "./MeetingIntentCard";

interface MeetingIntentListProps {
  replyId: string;
  contactId?: string;
  campaignId?: string;
}

export default function MeetingIntentList({
  replyId,
  contactId,
  campaignId,
}: MeetingIntentListProps) {
  const [intents, setIntents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const sb = supabaseBrowser();

  useEffect(() => {
    loadIntents();
  }, [replyId]);

  const loadIntents = async () => {
    try {
      let query = sb
        .from("meeting_intents")
        .select("*")
        .eq("reply_id", replyId)
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setIntents(data || []);
    } catch (error) {
      console.error("Error loading meeting intents:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (intents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {intents.map((intent) => (
        <MeetingIntentCard
          key={intent.id}
          intent={intent}
          replyId={replyId}
          onUpdate={loadIntents}
        />
      ))}
    </div>
  );
}















