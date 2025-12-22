import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  const { data: testees, error } = await supabase
    .from("nudge_prompt_candidates")
    .select(
      "id,owner_id,label,tone,campaign_id,sent_count,success_count,offline_score,base_prompt,candidate_prompt,test_start",
    )
    .eq("status", "testing")
    .gte("sent_count", 50);

  if (error) {
    console.error(error);
    return new Response("Failed to load candidates", { status: 500 });
  }

  for (const candidate of testees ?? []) {
    const sent = candidate.sent_count ?? 0;
    const success = candidate.success_count ?? 0;
    const sr = sent > 0 ? success / sent : 0;

    const { data: incumbents, error: incError } = await supabase
      .from("nudge_tuner")
      .select("success_count,fail_count,prompt")
      .eq("label", candidate.label)
      .eq("tone", candidate.tone)
      .order("weight", { ascending: false })
      .limit(1);

    if (incError) {
      console.error("Failed to fetch incumbent", incError);
      continue;
    }

    const inc = incumbents?.[0];
    const incSuccess = inc?.success_count ?? 0;
    const incFail = inc?.fail_count ?? 0;
    const incTotal = incSuccess + incFail;
    const incSr = incTotal > 0 ? incSuccess / incTotal : 0;
    const lift = incSr > 0
      ? (sr - incSr) / incSr
      : sr > 0
      ? 1
      : 0;

    if ((candidate.offline_score ?? 0) >= 0.60 && lift >= 0.12) {
      await supabase.from("nudge_tuner").insert([{
        owner_id: candidate.owner_id,
        label: candidate.label,
        tone: candidate.tone,
        prompt: candidate.candidate_prompt,
        example_reply: null,
        is_active: true,
        weight: 1.0,
      }]);

      await supabase.from("nudge_prompt_candidates").update({
        status: "promoted",
        test_end: new Date().toISOString(),
        notes: `Promoted with lift ${(lift * 100).toFixed(1)}%`,
      }).eq("id", candidate.id);
    } else if (
      sent >= 120 &&
      ((candidate.offline_score ?? 0) < 0.55 || lift <= -0.10)
    ) {
      await supabase.from("nudge_prompt_candidates").update({
        status: "rejected",
        test_end: new Date().toISOString(),
        notes: `Rejected (lift ${(lift * 100).toFixed(1)}%)`,
      }).eq("id", candidate.id);
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

