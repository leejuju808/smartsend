import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase configuration");
  throw new Error("Missing Supabase configuration");
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  try {
    const nowIso = new Date().toISOString();
    const { data: bumps, error } = await sb
      .from("scheduled_bumps")
      .select("id,account_id,thread_id,identity_id,run_at,subject,html_body")
      .eq("status", "queued")
      .lte("run_at", nowIso)
      .limit(50);

    if (error) {
      console.error("Failed to load scheduled bumps", error);
      return jsonResponse({ error: "Failed to load scheduled bumps" }, 500);
    }

    let processed = bumps?.length ?? 0;
    let sent = 0;

    for (const bump of bumps ?? []) {
      const { data: skip, error: skipError } = await sb.rpc("should_skip_bump", {
        p_thread: bump.thread_id,
        p_run_at: bump.run_at,
      });

      if (skipError) {
        console.error("should_skip_bump error", skipError);
      }

      if (skip) {
        await sb
          .from("scheduled_bumps")
          .update({ status: "skipped", reason: "new_inbound" })
          .eq("id", bump.id);
        continue;
      }

      const { data: thread, error: threadError } = await sb
        .from("reply_threads")
        .select("id,account_id,lead:leads(email),campaign_id")
        .eq("id", bump.thread_id)
        .single();

      if (threadError || !thread?.lead?.email) {
        console.warn("Skipping bump - missing thread/lead info", bump.id, threadError);
        continue;
      }

      const { data: leadRow, error: leadError } = await sb
        .from("leads")
        .select("id")
        .eq("email", thread.lead.email)
        .limit(1)
        .maybeSingle();

      if (leadError || !leadRow?.id) {
        console.warn("Skipping bump - missing lead record", bump.id, leadError);
        continue;
      }

      const insertPayload = {
        account_id: thread.account_id,
        campaign_id: thread.campaign_id,
        identity_id: bump.identity_id,
        lead_id: leadRow.id,
        subject: bump.subject,
        body: bump.html_body,
        scheduled_at: nowIso,
        priority: 50,
        thread_key: `bump:${bump.thread_id}`,
      };

      const { error: insertError } = await sb.from("send_queue").insert(insertPayload);
      if (insertError) {
        console.error("Failed to enqueue bump", insertError, insertPayload);
        continue;
      }

      const { error: updateError } = await sb
        .from("scheduled_bumps")
        .update({ status: "sent" })
        .eq("id", bump.id);

      if (updateError) {
        console.error("Failed to mark bump sent", updateError, bump.id);
        continue;
      }

      sent += 1;
    }

    return jsonResponse({ processed, sent });
  } catch (err) {
    console.error("Unhandled error in bump-runner", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: HeadersInit = { "content-type": "application/json" },
) {
  return new Response(JSON.stringify(body), { status, headers });
}

