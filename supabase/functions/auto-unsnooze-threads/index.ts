// Block 11900 — Inbox Snooze & Reminders v1
// Auto-unsnooze threads when snoozed_until time is reached
// Runs hourly via cron

import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

Deno.serve(async (req: Request) => {
  // Optional: Verify cron secret if set
  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  try {
    // Block 271700 — Prefer DB-side notifications + zero-mode filtering
    // (Falls back to auto_unsnooze_threads if the v2 function isn't present)
    let unsnoozedThreads: any[] | null = null;

    const v2Attempt = await supabase.rpc("auto_unsnooze_threads_with_notifications");
    if (!v2Attempt.error) {
      unsnoozedThreads = (v2Attempt.data as any[]) ?? [];
    } else {
      const v1Attempt = await supabase.rpc("auto_unsnooze_threads");
      if (v1Attempt.error) {
        console.error("auto-unsnooze-threads: failed to unsnooze threads", v1Attempt.error);
        return new Response(JSON.stringify({ error: v1Attempt.error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      unsnoozedThreads = (v1Attempt.data as any[]) ?? [];
    }

    if (!unsnoozedThreads || unsnoozedThreads.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, notifications: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Optional: log timeline events (no user-facing notifications here; DB handles it and respects zero mode)
    for (const thread of unsnoozedThreads) {
      const orgId = thread.org_id || thread.workspace_id || thread.account_id;
      if (!orgId) continue;

      await supabase
        .rpc("create_activity_event", {
          p_org_id: orgId,
          p_type: "status_changed",
          p_title: "Thread resurfaced",
          p_description: `Thread automatically unsnoozed (time reached)`,
          p_user_id: null,
          p_contact_id: thread.lead_id || null,
          p_campaign_id: thread.campaign_id || null,
          p_reply_thread_id: thread.thread_id,
          p_task_id: null,
          p_metadata: {
            action: "thread_unsnoozed",
            reason: "time_reached",
            thread_id: thread.thread_id,
          },
        })
        .catch((err: unknown) => {
          console.error(`Failed to log activity for thread ${thread.thread_id}:`, err);
        });
    }

    return new Response(
      JSON.stringify({
        processed: unsnoozedThreads.length,
        notifications: 0,
        threads: unsnoozedThreads.map((t: any) => ({
          thread_id: t.thread_id,
          lead_id: t.lead_id,
          campaign_id: t.campaign_id,
        })),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-unsnooze-threads: unexpected error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});




























































