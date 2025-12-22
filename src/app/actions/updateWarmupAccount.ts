"use server";

import { createClient } from "@/lib/supabase/server";

export async function upsertWarmupAccount(params: {
  fromEmail: string;
  isEnabled: boolean;
  maxPerDay?: number;
  startPerDay?: number;
  rampPerDay?: number;
}) {
  const supabase = createClient();

  const {
    fromEmail,
    isEnabled,
    maxPerDay = 30,
    startPerDay = 5,
    rampPerDay = 2,
  } = params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("smartsend_warmup_accounts")
    .upsert(
      {
        user_id: user.id,
        from_email: fromEmail,
        is_enabled: isEnabled,
        max_per_day: maxPerDay,
        start_per_day: startPerDay,
        ramp_per_day: rampPerDay,
        // Reset current_per_day to start_per_day if disabling/enabling
        current_per_day: isEnabled ? startPerDay : undefined,
      },
      { onConflict: "user_id,from_email" }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getWarmupAccount(fromEmail: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("smartsend_warmup_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("from_email", fromEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getWarmupStats() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const today = new Date().toISOString().slice(0, 10);

  // Get enabled accounts count
  const { data: accounts, error: accountsError } = await supabase
    .from("smartsend_warmup_accounts")
    .select("id, sent_today, current_per_day")
    .eq("user_id", user.id)
    .eq("is_enabled", true);

  if (accountsError) {
    throw accountsError;
  }

  // Get today's sent count from logs
  const { data: logs, error: logsError } = await supabase
    .from("smartsend_warmup_logs")
    .select("id")
    .in(
      "warmup_account_id",
      accounts?.map((a) => a.id) || []
    )
    .eq("status", "sent")
    .gte("created_at", `${today}T00:00:00Z`)
    .lt("created_at", `${today}T23:59:59Z`);

  if (logsError) {
    throw logsError;
  }

  return {
    mailboxesWarming: accounts?.length || 0,
    emailsSentToday: logs?.length || 0,
  };
}


































































