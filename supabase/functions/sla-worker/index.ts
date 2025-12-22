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

type InboxRow = {
  thread_id: string;
  campaign_id: string;
  lead_id: string | null;
  last_inbound_at: string | null;
  last_ai_label: string | null;
  sla_due_at: string | null;
  pinned: boolean | null;
  updated_at: string;
};

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: actionable, error: actionableError } = await supabase
    .from("v_inbox_with_sla")
    .select(
      "thread_id,campaign_id,lead_id,last_inbound_at,last_ai_label,sla_due_at,pinned,updated_at"
    )
    .in("last_ai_label", ["reply-positive", "reply-neutral"])
    .gte("last_inbound_at", twentyFourHoursAgo);

  if (actionableError) {
    console.error("sla-worker: failed to fetch actionable threads", actionableError);
    return new Response(JSON.stringify({ error: actionableError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let pinnedCount = 0;
  let taskEnsuredCount = 0;
  const actionableThreads = (actionable ?? []) as InboxRow[];

  for (const t of actionableThreads) {
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("user_id")
      .eq("id", t.campaign_id)
      .maybeSingle();

    if (campaignError) {
      console.error("sla-worker: failed to fetch campaign", { thread: t.thread_id, error: campaignError });
      continue;
    }

    const owner = campaign?.user_id as string | undefined;
    if (!owner) {
      console.warn("sla-worker: campaign missing owner", { thread: t.thread_id, campaign_id: t.campaign_id });
      continue;
    }

    const { error: pinError } = await supabase
      .from("inbox_threads")
      .update({ pinned: true })
      .eq("id", t.thread_id);

    if (pinError) {
      console.error("sla-worker: failed to pin thread", { thread: t.thread_id, error: pinError });
    } else {
      pinnedCount += 1;
    }

    const slaTitle = t.last_ai_label === "reply-positive" ? "Hot reply — follow up" : "Reply — follow up";

    const { error: ensureError } = await supabase.rpc("ensure_followup_task", {
      p_thread: t.thread_id,
      p_owner: owner,
      p_assignee: owner,
      p_title: slaTitle,
      p_due: t.sla_due_at
    });

    if (ensureError) {
      console.error("sla-worker: ensure_followup_task failed", { thread: t.thread_id, error: ensureError });
    } else {
      taskEnsuredCount += 1;
    }
  }

  const { data: openTasks, error: openTasksError } = await supabase
    .from("followup_tasks")
    .select("id,due_at,meta")
    .eq("status", "open");

  if (openTasksError) {
    console.error("sla-worker: failed to fetch open followup tasks", openTasksError);
    return new Response(JSON.stringify({
      ok: true,
      pinned: pinnedCount,
      ensured: taskEnsuredCount,
      overdueUpdates: 0,
      warning: "failed to load open tasks"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  let overdueUpdates = 0;
  const followupTasks = openTasks ?? [];

  for (const tk of followupTasks) {
    const dueTime = tk.due_at ? new Date(tk.due_at).getTime() : null;
    const overdue = !!dueTime && dueTime < Date.now();
    const currentMeta = (tk.meta ?? {}) as Record<string, unknown> & { overdue?: boolean };

    if (typeof currentMeta.overdue === "boolean" && currentMeta.overdue === overdue) {
      continue;
    }

    const newMeta = { ...currentMeta, overdue } as Record<string, unknown>;

    const { error: metaUpdateError } = await supabase
      .from("followup_tasks")
      .update({ meta: newMeta })
      .eq("id", tk.id);

    if (metaUpdateError) {
      console.error("sla-worker: failed to update task meta", { task: tk.id, error: metaUpdateError });
      continue;
    }

    overdueUpdates += 1;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      actionable: actionable?.length ?? 0,
      pinned: pinnedCount,
      ensured: taskEnsuredCount,
      overdueUpdates
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});

