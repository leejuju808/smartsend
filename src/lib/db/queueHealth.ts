import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration for queue health admin calls");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getQueueHealth() {
  const admin = getAdminClient();

  const { data: health, error: healthErr } = await admin
    .from("v_queue_health")
    .select("*")
    .single();

  if (healthErr) {
    throw healthErr;
  }

  const { data: hist, error: histErr } = await admin
    .from("v_retry_attempts_hist")
    .select("*")
    .order("attempt_count", { ascending: true });

  if (histErr) {
    throw histErr;
  }

  const { data: dls, error: dlsErr } = await admin
    .from("v_dead_letters_recent")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (dlsErr) {
    throw dlsErr;
  }

  return {
    health,
    hist: hist ?? [],
    deadletters: dls ?? [],
  };
}

export async function resubmitDeadLetter(id: string) {
  const admin = getAdminClient();

  const { data, error } = await admin.rpc("dead_letter_resubmit", { p_deadletter: id });

  if (error) {
    throw error;
  }

  return data;
}












