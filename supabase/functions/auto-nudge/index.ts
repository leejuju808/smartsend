// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const oai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

function resolveVars(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(.*?)\}\}/g, (_, k) => {
    const key = String(k).trim();
    return vars[key] ?? `{{${key}}}`;
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1) Plan tasks for due candidates
  const planRes = await supabase.rpc("plan_followups", { p_limit: limit });
  if (planRes.error) {
    return new Response(JSON.stringify({ error: planRes.error.message }), { status: 500 });
  }

  // 2) Fetch NEW tasks due now
  const nowIso = new Date().toISOString();
  const { data: tasks, error: tErr } = await supabase
    .from("followup_tasks")
    .select(`
      id,
      campaign_id,
      thread_id,
      lead_id,
      nudge_index,
      due_at,
      status,
      auto_send
    `)
    .eq("status", "queued")
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(limit);

  if (tErr) {
    return new Response(JSON.stringify({ error: tErr.message }), { status: 500 });
  }

  let drafted = 0;
  let sent = 0;
  let failed = 0;

  for (const task of tasks ?? []) {
    try {
      const { data: canNudge, error: gateErr } = await supabase.rpc("can_nudge_thread", {
        p_thread: task.thread_id,
      });

      if (gateErr) {
        throw new Error(gateErr.message);
      }

      if (canNudge === false) {
        await supabase
          .from("followup_tasks")
          .update({ status: "failed", reason: "throttled" })
          .eq("id", task.id);
        failed += 1;
        continue;
      }

      // 2a) Load rule + templates for campaign
      const { data: rule, error: rErr } = await supabase
        .from("followup_rules")
        .select("tone, subject_template, body_template")
        .eq("campaign_id", task.campaign_id)
        .single();

      if (rErr || !rule) {
        throw new Error(rErr?.message ?? "missing followup_rules");
      }

      // 2b) Hydrate vars
      let vars: Record<string, string> = {};

      try {
        const hv = await supabase.rpc("hydrate_campaign_vars", {
          p_campaign: task.campaign_id,
          p_lead: task.lead_id,
        });

        if (!hv.error && hv.data) {
          vars = hv.data as Record<string, string>;
        }
      } catch {
        // ignore hydration failures
      }

      // 2c) Resolve templates
      const resolvedSubject = resolveVars(
        rule.subject_template ?? "Following up",
        vars
      );
      const baseBody = resolveVars(
        rule.body_template ??
          "Hi {{first_name}},\n\nFollowing up.\n\nBest,\n{{sender_name}}",
        vars
      );

      // 2d) Rewrite with tone polish (optional)
      const prompt = `
You are an expert cold-email copywriter.
Tone: ${rule.tone ?? "professional"}.
Task: lightly polish the following email for clarity and brevity. Keep meaning. Keep variables already resolved.
Return ONLY the email body text.

---
${baseBody}
---
`.trim();

      let bodyOut = baseBody;

      try {
        const resp = await oai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.5,
          messages: [
            { role: "system", content: "You write concise, high-conversion B2B follow-ups." },
            { role: "user", content: prompt },
          ],
        });
        bodyOut = resp.choices?.[0]?.message?.content?.trim() || baseBody;
      } catch {
        // fallback to baseBody
        bodyOut = baseBody;
      }

      const bodyHtml = bodyOut.replace(/\n/g, "<br />");

      if (task.auto_send) {
        // enqueue immediate send
        const { error: qErr } = await supabase.from("send_queue").insert({
          thread_id: task.thread_id,
          campaign_id: task.campaign_id,
          lead_id: task.lead_id,
          subject: resolvedSubject,
          body_html: bodyHtml,
          status: "queued",
          send_after: nowIso,
          priority: 5,
        });

        if (qErr) {
          throw new Error(qErr.message);
        }

        await supabase
          .from("followup_tasks")
          .update({
            status: "sent",
            draft_subject: resolvedSubject,
            draft_body: bodyOut,
            auto_sent: true,
          })
          .eq("id", task.id);

        await supabase
          .from("followup_nudges")
          .insert({
            campaign_id: task.campaign_id,
            thread_id: task.thread_id,
            kind: "auto_nudge",
            note: "auto_send",
          })
          .catch(() => null);

        sent += 1;
      } else {
        const { error: dErr } = await supabase.from("outbox_drafts").insert({
          thread_id: task.thread_id,
          campaign_id: task.campaign_id,
          lead_id: task.lead_id,
          subject: resolvedSubject,
          body: bodyOut,
          source: "auto_nudge",
          status: "draft",
        });

        if (dErr) {
          throw new Error(dErr.message);
        }

        await supabase
          .from("followup_tasks")
          .update({
            status: "drafted",
            draft_subject: resolvedSubject,
            draft_body: bodyOut,
            auto_sent: false,
          })
          .eq("id", task.id);

        await supabase
          .from("followup_nudges")
          .insert({
            campaign_id: task.campaign_id,
            thread_id: task.thread_id,
            kind: "auto_nudge_draft",
            note: "auto_drafted",
          })
          .catch(() => null);

        drafted += 1;
      }
    } catch (e) {
      const reason =
        e instanceof Error ? e.message : typeof e === "string" ? e : "unknown_error";
      await supabase
        .from("followup_tasks")
        .update({ status: "failed", reason })
        .eq("id", task.id);
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({
      planned: tasks?.length ?? 0,
      drafted,
      sent,
      failed,
    }),
    {
      headers: { "content-type": "application/json" },
    }
  );
});


