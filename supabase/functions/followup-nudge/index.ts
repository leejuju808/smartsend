import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRON_SECRET");
const openAiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase credentials");
}

const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

type FollowupTaskRow = {
  id: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  nudge_index: number;
  status: string;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (cronSecret && key !== cronSecret) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: tasks, error } = await sb
    .from("followup_tasks")
    .select("id,campaign_id,thread_id,lead_id,nudge_index,status")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(Number(Deno.env.get("NUDGE_BATCH") ?? 20));

  if (error) return json({ error: error.message }, 500);
  if (!tasks?.length) return json({ ok: true, processed: 0 });

  if (!openAiKey) {
    return json({ error: "OPENAI_API_KEY missing" }, 500);
  }

  let drafted = 0;
  let sent = 0;
  let failed = 0;

  for (const task of tasks as FollowupTaskRow[]) {
    try {
      const ctx = await loadContext(task);
      const body = await buildNudge(ctx);

      if (ctx.rules.auto_send) {
        await sb.from("send_queue").insert({
          campaign_id: ctx.thread.campaign_id,
          lead_id: ctx.thread.lead_id,
          thread_id: task.thread_id,
          provider: ctx.provider,
          account_id: ctx.account_id,
          subject: ctx.subjectNext,
          body,
          headers: { to: ctx.lead.email },
          priority: 4,
          queued_at: new Date().toISOString(),
          status: "queued",
          source: "followup_nudge"
        });

        await sb.from("followup_tasks")
          .update({ status: "sent", auto_sent: true })
          .eq("id", task.id);
        sent += 1;
      } else {
        await sb.from("send_queue").insert({
          campaign_id: ctx.thread.campaign_id,
          lead_id: ctx.thread.lead_id,
          thread_id: task.thread_id,
          provider: ctx.provider,
          account_id: ctx.account_id,
          subject: ctx.subjectNext,
          body,
          headers: { to: ctx.lead.email },
          priority: 3,
          queued_at: new Date().toISOString(),
          status: "draft",
          source: "followup_nudge"
        });

        await sb.from("followup_tasks")
          .update({ status: "drafted", auto_sent: false })
          .eq("id", task.id);
        drafted += 1;
      }
    } catch (err) {
      failed += 1;
      await sb.from("followup_tasks")
        .update({ status: "failed" })
        .eq("id", task.id);
      await sb.from("send_logs")
        .insert({ status: "failed", error: `nudge: ${String(err instanceof Error ? err.message : err)}` });
    }
  }

  return json({ ok: true, drafted, sent, failed });
});

async function loadContext(task: FollowupTaskRow) {
  const [thread, lead, rules, campaign] = await Promise.all([
    sb.from("inbox_threads")
      .select("id,campaign_id,lead_id,subject,account_id")
      .eq("id", task.thread_id)
      .single(),
    sb.from("leads")
      .select("id,name,email,company,title")
      .eq("id", task.lead_id)
      .single(),
    sb.from("followup_rules")
      .select("*")
      .eq("campaign_id", task.campaign_id)
      .single(),
    sb.from("campaigns")
      .select("id,name,account_id,from_name,from_email")
      .eq("id", task.campaign_id)
      .single()
  ]);

  if (thread.error) throw new Error(thread.error.message);
  if (lead.error) throw new Error(lead.error.message);
  if (rules.error) throw new Error(rules.error.message);

  const subjectBase = thread.data.subject ?? "Following up";
  const subjectNext = task.nudge_index === 1
    ? `Quick follow-up: ${subjectBase}`
    : `Following up (${task.nudge_index}): ${subjectBase}`;

  const accountRes = await sb
    .from("accounts")
    .select("id,provider")
    .eq("id", thread.data.account_id ?? campaign.data?.account_id)
    .maybeSingle();

  const provider = accountRes.data?.provider ?? "gmail";
  const account_id = accountRes.data?.id ?? null;

  const messages = await sb
    .from("normalized_messages")
    .select("direction,subject,snippet,body_text,sent_at,ai_label")
    .eq("linked_thread_id", task.thread_id)
    .order("sent_at", { ascending: false })
    .limit(6);

  return {
    thread: thread.data,
    lead: lead.data,
    rules: rules.data,
    campaign: campaign.data,
    provider,
    account_id,
    subjectNext,
    messages: messages.data ?? [],
    nudgeIndex: task.nudge_index
  };
}

async function buildNudge(ctx: any): Promise<string> {
  const systemPrompt = "You are an SDR writing a short polite follow-up email for a cold outreach thread. Keep it human and specific.";
  const convo = ctx.messages
    .map((m: any) => {
      const snippet = (m.body_text ?? m.snippet ?? "").slice(0, 800);
      return `${m.direction.toUpperCase()} • ${new Date(m.sent_at).toISOString()} • ${m.ai_label ?? ""}\n${snippet}`;
    })
    .join("\n\n");

  const prompt = `
Lead: ${ctx.lead.name ?? ""} at ${ctx.lead.company ?? ""} <${ctx.lead.email}>
Offer/Campaign: ${ctx.campaign?.name ?? ""}

Tone=${ctx.rules.tone}; Length=${ctx.rules.length}; Nudge #${ctx.nudgeIndex ?? 1}

Thread context (latest first):
${convo}

Write a ${ctx.rules.length} follow-up that:
- references the prior context lightly,
- asks ONE clear next step (book a 10–15 min call or quick reply),
- no fluff, no hype, no hard sell,
- 3–5 sentences max when "short".

Return only the email body (plain text).
  `.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!resp.ok) throw new Error(`openai ${resp.status}`);

  const json = await resp.json();
  return json.choices?.[0]?.message?.content?.trim()
    ?? "Just checking back on this—open to a quick 10-min chat?";
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

