import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

type FollowupTask = {
  id: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  source_message_id: string | null;
  nudge_index: number;
  due_at: string;
  meta: Record<string, unknown>;
  status: string;
  attempt: number | null;
};

type FollowupRule = {
  auto_send: boolean;
  tone: string | null;
  max_nudges: number | null;
};

const JSON_HEADERS = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  const nowIso = new Date().toISOString();
  const { data: tasks, error } = await admin
    .from("followup_tasks")
    .select("id,campaign_id,thread_id,lead_id,source_message_id,nudge_index,due_at,meta,status,attempt")
    .eq("status", "queued")
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
  }

  if (!tasks?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: JSON_HEADERS });
  }

  const leadScoreMap = new Map<string, number>();
  if (tasks.length) {
    const leadIds = Array.from(new Set(tasks.map((t) => t.lead_id).filter(Boolean)));
    if (leadIds.length) {
      const { data: scores } = await admin
        .from("lead_scores")
        .select("lead_id, score, engagement_score")
        .in("lead_id", leadIds);
      for (const row of scores ?? []) {
        const val = Number(row.score ?? row.engagement_score ?? 0);
        leadScoreMap.set(row.lead_id, val);
      }
    }
  }

  let processed = 0;
  for (const task of tasks as FollowupTask[]) {
    const locked = await lockTask(task);
    if (!locked) {
      continue;
    }

    processed += 1;

    const { data: rule, error: ruleError } = await admin
      .from("followup_rules")
      .select("auto_send,tone,max_nudges")
      .eq("campaign_id", task.campaign_id)
      .maybeSingle();

    if (ruleError || !rule) {
      await setTaskError(task.id, "rule_missing");
      continue;
    }

    const quotaResult = await admin.rpc("enforce_campaign_quota", {
      p_campaign: task.campaign_id,
      p_kind: "followup_send",
      p_qty: 1,
    });

    if (quotaResult.error || quotaResult.data === false) {
      await admin
        .from("followup_tasks")
        .update({ status: "skipped", reason: "quota_exceeded" })
        .eq("id", task.id);
      continue;
    }

    const tone = (task.meta?.tone ?? rule.tone ?? "professional") as string;
    let vars: Record<string, string> = {};

    try {
      const hv = await admin.rpc("hydrate_campaign_vars", {
        p_campaign: task.campaign_id,
        p_lead: task.lead_id,
      });
      if (!hv.error && hv.data) {
        vars = hv.data as Record<string, string>;
      }
    } catch {
      // ignore hydration errors; fall back to raw templates
    }

    const subjectTemplate = `Quick follow-up (${task.nudge_index})`;
    const bodyTemplate = renderFollowupBody(tone);
    const subject = resolveTemplate(subjectTemplate, vars);
    const body = resolveTemplate(bodyTemplate, vars);

    try {
      let notBefore: string | null = null;
      try {
        const { data: stoTs, error: stoError } = await admin.rpc("apply_sto", {
          p_thread: task.thread_id,
          p_lead: task.lead_id,
        });
        if (!stoError && stoTs) {
          notBefore = typeof stoTs === "string" ? stoTs : new Date(stoTs).toISOString();
        }
      } catch {
        // ignore STO errors
      }

      const rawScore = leadScoreMap.get(task.lead_id) ?? 0;
      const priorityBoost = Math.min(100, Math.max(0, Math.floor(rawScore)));

      if (rule.auto_send) {
        await admin.from("send_queue").insert({
          campaign_id: task.campaign_id,
          thread_id: task.thread_id,
          lead_id: task.lead_id,
          subject,
          body,
          meta: { type: "auto_followup", nudge_index: task.nudge_index, vars },
          not_before: notBefore,
          priority: priorityBoost,
        });

        await admin.from("followup_tasks").update({ status: "sent", auto_sent: true }).eq("id", task.id);
      } else {
        await admin.from("drafts").insert({
          campaign_id: task.campaign_id,
          thread_id: task.thread_id,
          lead_id: task.lead_id,
          source_message_id: task.source_message_id,
          subject,
          body,
          meta: { type: "auto_followup", nudge_index: task.nudge_index, vars },
        });

        await admin.from("followup_tasks").update({ status: "drafted", auto_sent: false }).eq("id", task.id);
      }

      await admin.from("campaign_events").insert({
        campaign_id: task.campaign_id,
        type: rule.auto_send ? "followup_sent" : "followup_drafted",
        actor_user_id: null,
        target_user_id: null,
        meta: {
          thread_id: task.thread_id,
          lead_id: task.lead_id,
          nudge_index: task.nudge_index,
          tone,
          vars,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "send_error";
      await admin.from("followup_tasks").update({ status: "failed", reason: message }).eq("id", task.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), { headers: JSON_HEADERS });
});

async function lockTask(task: FollowupTask): Promise<boolean> {
  const { data, error } = await admin
    .from("followup_tasks")
    .update({ attempt: (task.attempt ?? 0) + 1 })
    .eq("id", task.id)
    .eq("status", "queued")
    .eq("attempt", task.attempt ?? 0)
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

async function setTaskError(taskId: string, code: string) {
  await admin.from("followup_tasks").update({ status: "failed", reason: code }).eq("id", taskId);
}

function renderFollowupBody(tone: string): string {
  switch (tone) {
    case "friendly":
      return "Just checking in to see if you had a chance to look this over. Happy to keep it short — would a quick intro call help?";
    case "concise":
      return "Bumping this to the top — worth a quick look?";
    case "assertive":
      return "Following up on my earlier note. If now isn’t the right time, point me to the right person and I’ll take it from there.";
    default:
      return "Following up in case my last note got buried. If there’s interest, I can share a 2-minute overview or set a quick call.";
  }
}

function resolveTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const k = String(key).trim();
    return vars[k] ?? `{{${k}}}`;
  });
}


