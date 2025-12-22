// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: jobs } = await supabase
    .from("reverify_queue")
    .select("id,email,lead_id,attempts")
    .eq("status", "queued")
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!jobs?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  for (const j of jobs) {
    await supabase.from("reverify_queue").update({
      status: "processing",
      attempts: j.attempts + 1,
      last_attempt_at: new Date().toISOString(),
    }).eq("id", j.id);

    try {
      const domain = j.email.split("@")[1];
      const valid = !!domain && domain.includes(".");
      const status = valid ? "verified" : "invalid";

      await supabase.from("reverify_queue").update({
        status,
        result: { domain },
      }).eq("id", j.id);

      if (status === "invalid") {
        await supabase.from("suppressions_email").upsert({
          email: j.email,
          reason: "hard_bounce",
          expires_at: null,
        });
        await supabase.from("followup_state")
          .update({ is_done: true })
          .eq("lead_id", j.lead_id);
      }
    } catch (e) {
      await supabase.from("reverify_queue").update({
        status: "error",
        result: { message: String(e) },
      }).eq("id", j.id);
    }
  }

  return new Response(JSON.stringify({ processed: jobs.length }), {
    status: 200,
  });
});



