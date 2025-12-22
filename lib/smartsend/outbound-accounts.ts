// lib/smartsend/outbound-accounts.ts
// Block 8170 — helpers to fetch outbound email accounts

import { createClient } from "@/lib/supabase/server";

export type OutboundEmailAccount = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  provider: "gmail" | "outlook" | "smtp";
  display_name: string | null;
  from_email: string;
  status: "connected" | "revoked" | "error";
  daily_limit: number | null;
  used_today: number;
  created_at: string;
};

export async function getOutboundAccountsForCurrentUser() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  // TODO: filter by org_id if you have org context
  const { data, error } = await supabase
    .from("outbound_email_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "connected")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getOutboundAccountsForCurrentUser error:", error);
    return [];
  }

  return (data ?? []) as OutboundEmailAccount[];
}

































































