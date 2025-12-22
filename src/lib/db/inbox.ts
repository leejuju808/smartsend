import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error("Missing Supabase configuration for inbox fetcher");
}

export async function getInboxThreads(campaignId: string) {
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("inbox_threads")
    .select(
      `
        id,
        campaign_id,
        lead_id,
        updated_at,
        replied_at,
        messages:inbox_messages (
          id,
          created_at,
          direction,
          ai_label,
          ai_confidence,
          subject,
          body_text
        )
      `
    )
    .eq("campaign_id", campaignId)
    .eq("messages.direction", "in")
    .order("updated_at", { ascending: false })
    .order("created_at", { referencedTable: "inbox_messages", ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to load inbox threads: ${error.message}`);
  }

  return data ?? [];
}


