"use client";

import { createClientComponentClient } from "@/lib/supabase";

export async function fetchThreadMessages(threadId: string, teamId: string) {
  const supabase = createClientComponentClient();
  const { data } = await supabase
    .from("email_messages")
    .select("*")
    .eq("team_id", teamId)
    .eq("thread_id", threadId)
    .order("received_at", { ascending: true });
  return data || [];
}
