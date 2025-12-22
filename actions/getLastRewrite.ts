"use server";

import { createClient } from "@/lib/supabase/server";

export async function getLastRewrite(
  campaignId: string,
  target: "subject" | "body"
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("smartsend_ai_rewrite_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("campaign_id", campaignId)
    .eq("target", target)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return data;
}


































































