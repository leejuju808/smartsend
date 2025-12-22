import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type MailboxHealth = {
  email: string;
  account_id: string;
  send_limit: number;
  reputation_score: number;
  paused: boolean;
};

function rampUp(limit: number) {
  return Math.min(limit + 10, 500);
}

function rampDown(limit: number) {
  return Math.max(20, Math.floor(limit * 0.9));
}

async function adjustMailbox(mailbox: MailboxHealth) {
  if (mailbox.paused) {
    return false;
  }

  let nextLimit = mailbox.send_limit ?? 0;

  if (mailbox.reputation_score > 85 && nextLimit < 500) {
    nextLimit = rampUp(nextLimit);
  } else if (mailbox.reputation_score < 60 && nextLimit > 20) {
    nextLimit = rampDown(nextLimit);
  }

  if (nextLimit === mailbox.send_limit) {
    return false;
  }

  const { error } = await supabase
    .from("mailbox_health")
    .update({ send_limit: nextLimit, last_update: new Date().toISOString() })
    .eq("email", mailbox.email);

  if (error) {
    console.error("Failed to update mailbox send limit", mailbox.email, error);
    return false;
  }

  return true;
}

Deno.serve(async () => {
  const { data: health, error } = await supabase
    .from("mailbox_health")
    .select("email, account_id, send_limit, reputation_score, paused");

  if (error) {
    console.error("Failed to load mailbox health", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let adjusted = 0;
  for (const mailbox of health ?? []) {
    const didChange = await adjustMailbox(mailbox as MailboxHealth);
    if (didChange) {
      adjusted += 1;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, inspected: health?.length ?? 0, adjusted }),
    { headers: { "content-type": "application/json" } }
  );
});







