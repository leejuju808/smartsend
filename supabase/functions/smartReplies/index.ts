import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://deno.land/x/openai@v4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SYSTEM = `You are a concise SDR assistant.

Rules:
- Preserve merge tags like {{first_name}}, {{company}} if present.
- Plain text only. 3–6 sentences max.
- Friendly, clear, low-friction. Avoid spammy language.
- Offer a simple CTA (pick a time, quick yes/no).
- Provide 4 variants with labels: Interested, Pricing, Not now, Not a fit. Optional Opt-out.
- Use the sender's name as {{sender_name}} placeholder if not provided.`;

serve(async (req) => {
  try {
    const { org_id, lead_id, campaign_id, thread_id, last_message, context, sender_name } = await req.json();

    // Optional: load org presets to include as alternatives
    const { data: presets } = await supa
      .from("reply_presets")
      .select("label, body")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .limit(10);

    const prompt = [
      `Lead message:\n${last_message}\n`,
      `Context (campaign/product/value):\n${context || "N/A"}`,
      `Sender name: ${sender_name || "{{sender_name}}"}\n`,
      `Return JSON: { suggestions: [{label, body}] }`,
      `Labels must be one of: Interested, Pricing, Not now, Not a fit, Opt-out.`,
    ].join("\n");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt }
      ]
    });

    const ai = JSON.parse(resp.choices[0].message.content || `{"suggestions":[]}`);
    const suggestions = Array.isArray(ai.suggestions) ? ai.suggestions : [];

    // Merge in presets (non-duplicating labels preferred)
    const presetAdd = (presets || []).map(p => ({ label: p.label, body: p.body, source: "preset" as const }));
    const merged = [
      ...suggestions.map((s: any) => ({ ...s, source: "ai" as const })),
      ...presetAdd
    ]
      // prefer max 5 distinct labels, keep first occurrence
      .reduce((acc: any[], s: any) => acc.some(x => x.label === s.label) ? acc : [...acc, s], [])
      .slice(0, 5);

    // Store suggestion set
    const { data: rec, error } = await supa.from("reply_suggestions").insert({
      org_id, lead_id, campaign_id, email_thread_id: thread_id, suggested: merged
    }).select("id").single();
    if (error) throw error;

    return new Response(JSON.stringify({ id: rec.id, suggestions: merged }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
});

