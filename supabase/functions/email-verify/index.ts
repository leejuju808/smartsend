import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const verifierUrl = Deno.env.get("EMAIL_VERIFIER_URL");
const verifierKey = Deno.env.get("EMAIL_VERIFIER_KEY");

Deno.serve(async () => {
  const supa = createClient(supabaseUrl, supabaseKey);

  // fetch one job
  const { data: job } = await supa
    .from("email_verify_jobs")
    .select("*")
    .eq("status", "queued")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!job) return json({ ok: true, msg: "no-jobs" });

  await supa.from("email_verify_jobs").update({ status: "processing" }).eq("id", job.id);

  try {
    let verdict = "unknown";
    let score = 0.5;

    if (verifierUrl && verifierKey) {
      const r = await fetch(`${verifierUrl}/verify?email=${encodeURIComponent(job.email)}`, {
        headers: { Authorization: `Bearer ${verifierKey}` },
      });
      if (r.ok) {
        const j = await r.json();
        verdict = j.verdict || verdict; // 'valid','invalid','accept_all','unknown'
        score = typeof j.score === "number" ? j.score : score;
      }
    } else {
      // Fallback: syntax + MX guess (very light)
      verdict = job.email.includes("@") ? "unknown" : "invalid";
      score = verdict === "invalid" ? 0.0 : 0.5;
    }

    await supa
      .from("email_verify_jobs")
      .update({ status: "done", verdict, score })
      .eq("id", job.id);

    // reflect on lead
    if (job.lead_id) {
      await supa
        .from("leads")
        .update({
          email_status:
            verdict === "invalid"
              ? "invalid"
              : verdict === "valid"
              ? "valid"
              : "risky",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.lead_id);
    }

    return json({ ok: true, id: job.id, verdict, score });
  } catch (e) {
    await supa
      .from("email_verify_jobs")
      .update({ status: "failed", last_error: String(e) })
      .eq("id", job.id);
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

