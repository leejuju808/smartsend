import { supabase } from "@/lib/supabaseClient";

export async function getReplies(userId: string) {
  // First try to get from replies table if it exists
  const { data: existingReplies, error: existingError } = await supabase
    .from("replies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!existingError && existingReplies?.length) {
    return existingReplies;
  }

  // Fallback: fetch from leads table where replied=true
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("replied", true)
    .order("replied_at", { ascending: false });

  if (error) throw error;
  return data;
}

