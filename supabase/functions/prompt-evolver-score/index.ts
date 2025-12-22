import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const { owner_id, candidate_ids = [], sample_size = 20 } = await req.json();
  if (!owner_id) {
    return new Response("Missing owner_id", { status: 400 });
  }

  const inIds = candidate_ids.length
    ? candidate_ids
    : ["00000000-0000-0000-0000-000000000000"];

  const { data: drafts, error } = await supabase.from("nudge_prompt_candidates")
    .select("id,label,tone,candidate_prompt,offline_score")
    .eq("owner_id", owner_id)
    .in("id", inIds)
    .eq("status", "draft");

  if (error) {
    console.error(error);
    return new Response("Failed to fetch drafts", { status: 500 });
  }

  const results: Array<{ id: string; offline_score: number }> = [];

  for (const draft of drafts ?? []) {
    const rsp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/nudge-offline-eval`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          owner_id,
          label: draft.label,
          tone: draft.tone,
          prompt: draft.candidate_prompt,
          sample_size,
        }),
      },
    );

    let score = 0;
    try {
      const body = await rsp.json();
      score = Number(body?.avg ?? 0);
    } catch (parseError) {
      console.error("Failed to parse offline eval response", parseError);
    }

    await supabase.from("nudge_prompt_candidates").update({
      offline_score: score,
    }).eq("id", draft.id);

    if (score >= 0.62) {
      await supabase.from("nudge_prompt_candidates").update({
        status: "testing",
        test_start: new Date().toISOString(),
      }).eq("id", draft.id);
    }

    results.push({ id: draft.id, offline_score: score });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
  });
});

