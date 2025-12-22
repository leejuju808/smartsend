// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifySignature } from "../_shared/signing.ts";

const GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249,
  4, 1, 0, 0, 1, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

Deno.serve(async (req) => {
  if (!(await verifySignature(req.url))) {
    return new Response("bad sig", { status: 403 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return new Response(GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store",
      },
    });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ua = req.headers.get("user-agent") ?? "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "";

  const { queue, err } = await fetch(
    `${sbUrl}/rest/v1/send_queue?select=id,campaign_id,step_id,variant_id,lead_id,thread_id&tracking_token=eq.${encodeURIComponent(token)}`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  )
    .then(async (r) => ({
      queue: await r.json(),
      err: r.ok ? null : await r.text(),
    }))
    .catch((e) => ({ queue: null, err: String(e) }));

  if (err) {
    console.error("[open-pixel] queue lookup failed:", err);
  }

  const q = Array.isArray(queue) ? queue[0] : null;
  if (q) {
    const payload = [{
      event: "open",
      campaign_id: q.campaign_id,
      step_id: q.step_id,
      variant_id: q.variant_id,
      lead_id: q.lead_id,
      thread_id: q.thread_id,
      queue_id: q.id,
      user_agent: ua,
      ip_hash: await sha256(ip),
    }];

    await fetch(`${sbUrl}/rest/v1/tracking_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }).catch((e) =>
      console.error("[open-pixel] insert tracking_events failed:", e)
    );

    // Block 485: Update intent score based on open tracking
    if (q.lead_id) {
      // Check existing opens count (the current open was just inserted)
      const { data: openEvents } = await fetch(
        `${sbUrl}/rest/v1/tracking_events?select=id&event=eq.open&lead_id=eq.${q.lead_id}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        },
      )
        .then((r) => r.json())
        .catch(() => []);

      // If we have 3+ opens total (including the one just inserted), use open_multi
      const openCount = Array.isArray(openEvents) ? openEvents.length : 0;
      const signalType = openCount >= 3 ? "open_multi" : "open";

      // Call intent-score-update function asynchronously
      fetch(`${sbUrl}/functions/v1/intent-score-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          lead_id: q.lead_id,
          signal_type: signalType,
        }),
      }).catch((e) =>
        console.warn("[open-pixel] Failed to update intent score:", e)
      );
    }
  }

  return new Response(GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
});

async function sha256(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}


