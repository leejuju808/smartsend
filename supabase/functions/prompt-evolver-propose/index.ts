import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.21.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req) => {
  const { owner_id, campaign_id = null, label, tone, num = 3 } = await req.json();
  if (!owner_id || !label || !tone) {
    return new Response("Missing params", { status: 400 });
  }

  const { data: bases, error: baseError } = await supabase.from("nudge_tuner")
    .select("prompt,tone,label,success_count,fail_count")
    .eq("label", label)
    .eq("tone", tone)
    .order("weight", { ascending: false })
    .limit(1);
  if (baseError) {
    console.error(baseError);
    return new Response("Failed to fetch base prompt", { status: 500 });
  }
  if (!bases?.length) {
    return new Response("No base prompt found", { status: 404 });
  }

  const basePrompt = bases[0].prompt;
  const sys =
    "You evolve B2B follow-up PROMPTS (not final emails). Each candidate must be a one-paragraph instruction to a copywriter model. Keep them concise but specific.";
  const user =
    `Base prompt:\n"""${basePrompt}"""\n\nGenerate ${num} alternative prompts that vary CTA style, specificity, and empathy while staying ${tone}. Return as a JSON array under "candidates".`;

  const comp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.8,
  });
  const text = comp.choices[0]?.message?.content ?? '{"candidates":[]}';
  const matches = text.match(/\{[\s\S]*\}$/);

  let json: { candidates?: string[] } = { candidates: [] };
  try {
    json = matches ? JSON.parse(matches[0]) : { candidates: [] };
  } catch (parseError) {
    console.error("Failed to parse candidate JSON", parseError);
  }

  const candidates = (json.candidates ?? []).slice(0, num).filter(Boolean);
  if (!candidates.length) {
    return new Response(
      JSON.stringify({ ok: false, count: 0, candidates: [] }),
      { status: 200 },
    );
  }

  const rows = candidates.map((candidate_prompt: string) => ({
    owner_id,
    campaign_id,
    label,
    tone,
    base_prompt: basePrompt,
    candidate_prompt,
    status: "draft",
  }));

  const { data: inserted, error } = await supabase.from("nudge_prompt_candidates")
    .insert(rows)
    .select("id,candidate_prompt");
  if (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      count: inserted?.length ?? 0,
      candidates: inserted ?? [],
    }),
    { status: 200 },
  );
});

