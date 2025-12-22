import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.61.0";

const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = {
  id: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  rule_snapshot: Record<string, unknown>;
};

serve(async (_req) => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tasks, error: errTasks } = await sb
    .from("followup_tasks")
    .select("id,campaign_id,thread_id,lead_id,rule_snapshot")
    .eq("status", "queued")
    .lte("run_at", new Date().toISOString())
    .limit(25);

  if (errTasks) {
    return new Response(JSON.stringify({ error: errTasks.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!tasks?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;

  for (const t of tasks as Row[]) {
    await sb
      .from("followup_tasks")
      .update({ attempts: (sb as any).sql`attempts + 1` })
      .eq("id", t.id);

    try {
      const { data: canNudge, error: gateErr } = await sb.rpc("can_nudge_thread", {
        p_thread: t.thread_id,
      });

      if (gateErr) {
        throw new Error(gateErr.message);
      }

      if (canNudge === false) {
        await sb
          .from("followup_tasks")
          .update({
            status: "error",
            last_error: "throttled",
          })
          .eq("id", t.id);
        continue;
      }

      const [{ data: inbound }, { data: outbound }, { data: lead }] = await Promise.all([
        sb.from("v_last_inbound").select("subject,body,sent_at").eq("thread_id", t.thread_id).single(),
        sb.from("v_last_outbound").select("subject,body,sent_at").eq("thread_id", t.thread_id).single(),
        sb.from("leads")
          .select("first_name,last_name,company,email")
          .eq("id", t.lead_id)
          .single(),
      ]);

      const rule = t.rule_snapshot ?? {};
      const tone = String(rule.tone ?? "professional");
      const style = String(rule.style ?? "plain");
      const maxLen = Number(rule.max_len ?? 300);
      const ctaHint = String(
        rule.cta_hint ?? "Propose a quick 15-min call this week."
      );
      const autoSend = Boolean(rule.auto_send);

      const sys = [
        "You are SmartSend AI. Write a short, respectful follow-up to a prospect.",
        `Tone: ${tone}`,
        `Style: ${style} (use bullets only if style='bullet')`,
        `Max length: ${maxLen} characters (soft)`,
        "Be helpful and specific; don't be pushy. One CTA only.",
      ].join("\n");

      const usr = {
        task: "Generate follow-up email body.",
        lead: lead ?? null,
        last_inbound: inbound ?? null,
        last_outbound: outbound ?? null,
        cta_hint: ctaHint,
      };

      const comp = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.5,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(usr) },
        ],
      });

      const body =
        comp.choices?.[0]?.message?.content?.trim() ??
        "Following up on my last note — any thoughts?";
      const subject = inbound?.subject ? `Re: ${inbound.subject}` : "Quick follow-up";

      const { data: draftId, error: draftErr } = await sb.rpc("upsert_thread_draft", {
        p_thread: t.thread_id,
        p_campaign: t.campaign_id,
        p_lead: t.lead_id,
        p_subject: subject,
        p_body: body,
        p_source_message: null,
      });

      if (draftErr) {
        throw new Error(draftErr.message);
      }

      if (autoSend) {
        const { data: outboxId, error: outErr } = await sb.rpc("send_draft_now", {
          p_draft: draftId,
        });
        if (outErr) {
          throw new Error(outErr.message);
        }

        await sb
          .from("followup_tasks")
          .update({
            status: "drafted",
            draft_id: draftId ?? null,
            message_id: outboxId ?? null,
          })
          .eq("id", t.id);

        const dispatcherUrl =
          Deno.env.get("MAIL_DISPATCHER_URL") ?? "/functions/v1/mail-dispatcher";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

        await fetch(dispatcherUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${anonKey}` },
        }).catch(() => null);

        await sb
          .from("followup_nudges")
          .insert({
            campaign_id: t.campaign_id,
            thread_id: t.thread_id,
            kind: "auto_nudge_send",
            note: "auto_send",
          })
          .catch(() => null);
      } else {
        await sb
          .from("followup_tasks")
          .update({
            status: "drafted",
            draft_id: draftId ?? null,
            message_id: null,
          })
          .eq("id", t.id);

        await sb
          .from("followup_nudges")
          .insert({
            campaign_id: t.campaign_id,
            thread_id: t.thread_id,
            kind: "auto_nudge_draft",
            note: "auto_drafted",
          })
          .catch(() => null);
      }

      processed++;
    } catch (err) {
      await sb
        .from("followup_tasks")
        .update({
          status: "error",
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", t.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "Content-Type": "application/json" },
  });
});

