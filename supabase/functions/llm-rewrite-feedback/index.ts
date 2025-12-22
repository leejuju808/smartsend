import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // Fetch all approved variants
    const { data: variants, error: variantsError } = await sb
      .from("followup_template_variants")
      .select("id, campaign_id, tone, base_template_id")
      .eq("status", "approved");

    if (variantsError) {
      console.error("Error fetching variants:", variantsError);
      return new Response(JSON.stringify({ error: variantsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!variants || variants.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const v of variants) {
      // Get step_number from base_template_id if available, otherwise default to 1
      const { data: baseTemplate } = await sb
        .from("followup_templates")
        .select("step_number")
        .eq("id", v.base_template_id)
        .single();

      const stepNumber = baseTemplate?.step_number ?? 1;

      // Fetch message outcomes for this variant
      const { data: messages, error: messagesError } = await sb
        .from("message_outcomes")
        .select("id, positive_reply, meeting_intent, opened_at, template_variant_id")
        .eq("template_variant_id", v.id);

      if (messagesError) {
        console.error(`Error fetching messages for variant ${v.id}:`, messagesError);
        continue;
      }

      if (!messages || messages.length === 0) continue;

      const opens = messages.filter((x) => x.opened_at).length;
      const positives = messages.filter((x) => x.positive_reply).length;
      const meetings = messages.filter((x) => x.meeting_intent).length;
      const total = messages.length;

      const open_rate = total > 0 ? opens / total : 0;
      const positive_rate = opens > 0 ? positives / opens : 0;
      const meeting_rate = opens > 0 ? meetings / opens : 0;
      const engagement_score = 0.2 * open_rate + 0.6 * positive_rate + 0.2 * meeting_rate;

      // Upsert feedback entry (one per variant)
      const { error: upsertError } = await sb
        .from("llm_rewrite_feedback")
        .upsert(
          {
            variant_id: v.id,
            campaign_id: v.campaign_id,
            step_number: stepNumber,
            tone: v.tone,
            message_count: total,
            open_rate,
            positive_rate,
            meeting_rate,
            engagement_score,
          },
          { onConflict: "variant_id", ignoreDuplicates: false }
        );

      if (upsertError) {
        console.error(`Error upserting feedback for variant ${v.id}:`, upsertError);
        continue;
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

