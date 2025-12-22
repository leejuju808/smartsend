// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifySignature } from "../_shared/signing.ts";

Deno.serve(async (req) => {
  if (!(await verifySignature(req.url))) {
    return new Response("bad sig", { status: 403 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const dest = url.searchParams.get("u");
  if (!token || !dest) {
    return new Response("Bad Request", { status: 400 });
  }

  const redirectTarget = safeDecode(dest);
  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ua = req.headers.get("user-agent") ?? "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "";

  const response = await fetch(
    `${sbUrl}/rest/v1/send_queue?select=id,campaign_id,step_id,variant_id,lead_id,thread_id&tracking_token=eq.${encodeURIComponent(token)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );

  const rows: any[] = await response.json();
  const q = Array.isArray(rows) ? rows[0] : null;

  if (q) {
    await fetch(`${sbUrl}/rest/v1/tracking_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{
        event: "click",
        campaign_id: q.campaign_id,
        step_id: q.step_id,
        variant_id: q.variant_id,
        lead_id: q.lead_id,
        thread_id: q.thread_id,
        queue_id: q.id,
        url: redirectTarget,
        user_agent: ua,
        ip_hash: await sha256(ip),
      }]),
    }).catch((e) =>
      console.error("[click] insert tracking_events failed:", e)
    );

    // Block 485: Update intent score based on click tracking
    if (q.lead_id) {
      // Call intent-score-update function asynchronously
      fetch(`${sbUrl}/functions/v1/intent-score-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          lead_id: q.lead_id,
          signal_type: "click",
        }),
      }).catch((e) =>
        console.warn("[click] Failed to update intent score:", e)
      );
    }
  }

  return Response.redirect(redirectTarget, 302);
});

async function sha256(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}


