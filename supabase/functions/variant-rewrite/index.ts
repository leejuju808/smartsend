// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const url = new URL(req.url);
  const stepId = url.searchParams.get("stepId");
  const n = Number(url.searchParams.get("n") ?? "3");
  const presetId = url.searchParams.get("presetId");
  const autoInsert = url.searchParams.get("insert") === "1";

  if (!stepId) {
    return new Response(JSON.stringify({ error: "stepId required" }), { status: 400 });
  }

  const payload = await req.json().catch(() => ({}));
  const goal: string = payload?.goal ?? "";

  const sb = (path: string, init?: RequestInit) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...(init ?? {}),
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation",
        ...(init?.headers ?? {}),
      },
    });

  // Load step + optional preset
  const stepRes = await sb(`campaign_steps?select=id,campaign_id,name&id=eq.${stepId}`);
  const steps: Row[] = await stepRes.json();
  if (!steps.length) {
    return new Response(JSON.stringify({ error: "step_not_found" }), { status: 404 });
  }

  let preset: Row | null = null;
  if (presetId) {
    const pr = await sb(`rewrite_presets?select=id,name,tone,style,cta,max_words&id=eq.${presetId}`);
    const pj: Row[] = await pr.json();
    preset = pj[0] ?? null;
  }

  // Pull recent winners for context (top 3 by reply_rate with sends >= 10, last 30d)
  const winRes = await sb(
    `v_variant_metrics?select=variant_id,name,weight,active,reply_rate,sends,step_id&step_id=eq.${stepId}&sends=gte.10&order=reply_rate.desc&limit=3`
  );
  const winners: Row[] = await winRes.json();
  const ids = winners.map((w) => w.variant_id);
  let examples: Row[] = [];
  if (ids.length) {
    const ex = await sb(`step_variants?select=id,subject,body,name&id=in.(${ids.join(",")})`);
    examples = await ex.json();
  }

  // Compose the prompt
  const sys = `You are an expert cold email copywriter for SMB B2B outreach. 
- Optimize for concise clarity, one CTA, and natural language. 
- Use {{lead.first_name}} and other {{variable}} placeholders as-is.
- Avoid spammy words, avoid exclamation overload, target 3–6 sentence body unless otherwise requested.
- Return valid JSON only, no commentary.`;

  const goalText = [
    goal ? `Goal: ${goal}` : null,
    preset ? `Tone: ${preset.tone}; Style: ${preset.style}; CTA: ${preset.cta}; MaxWords: ${preset.max_words}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const exText = examples
    .map(
      (e, i) =>
        `Example ${i + 1} — ${e.name}:\nSubject: ${e.subject ?? "(none)"}\nBody:\n${e.body}`
    )
    .join("\n\n");

  const user = `Step: ${steps[0].name}
${goalText ? goalText + "\n\n" : ""}Top performers (last month):
${exText || "(no data)"}

Generate ${n} improved variants as JSON:
{
  "items": [
    { "name": "A*", "subject": "...", "body": "..."},
    { "name": "B*", "subject": "...", "body": "..."}
  ]
}`;

  // Call OpenAI (Responses API)
  const oaiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    }),
  });

  if (!oaiRes.ok) {
    const txt = await oaiRes.text();
    return new Response(JSON.stringify({ error: "openai_error", detail: txt }), { status: 500 });
  }

  const oaiJson = await oaiRes.json();
  const raw = oaiJson.output?.[0]?.content?.[0]?.text ?? oaiJson.output_text ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) {
      return new Response(JSON.stringify({ error: "bad_json_from_model", raw }), { status: 500 });
    }
    parsed = JSON.parse(m[0]);
  }

  const items: { name: string; subject?: string; body: string }[] = parsed?.items ?? [];
  if (!Array.isArray(items) || !items.length) {
    return new Response(JSON.stringify({ error: "no_items", raw }), { status: 500 });
  }

  // Optional insert
  let inserted: Row[] = [];
  if (autoInsert) {
    const insertPayload = items.map((it) => ({
      step_id: stepId,
      name: it.name?.slice(0, 24) || "AI",
      subject: it.subject?.slice(0, 200) ?? null,
      body: it.body,
      weight: 5,
      is_html: false,
      active: true,
      origin: "ai",
      notes: goal || (preset ? `preset:${preset.name}` : null),
    }));
    const ins = await sb("step_variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(insertPayload),
    });
    inserted = await ins.json();
  }

  return new Response(JSON.stringify({ ok: true, items, inserted }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});




