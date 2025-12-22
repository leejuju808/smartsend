import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Check if user has a connected Gmail account
 */
export async function hasGmailAccount(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("connected_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  return !!data;
}

/**
 * Get user's connected Gmail account email
 */
export async function getGmailAccountEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("connected_accounts")
    .select("email")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  return data?.email || null;
}

