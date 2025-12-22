import { createClient } from "@supabase/supabase-js";
import { mapOutlookBounce } from "@/lib/bounce";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const vt =
    url.searchParams.get("validationtoken") ||
    url.searchParams.get("validationToken");

  if (vt) {
    return new Response(vt, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new Response("OK");
}

export async function POST(req: Request) {
  const body = await req.json();
  const notifications = Array.isArray(body?.value) ? body.value : [body];

  for (const n of notifications) {
    if (n.clientState && n.clientState !== process.env.MS_GRAPH_CLIENT_STATE) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const note of notifications) {
    const mapped = mapOutlookBounce(note);
    if (!mapped.provider_message_id) continue;

    await admin
      .rpc("upsert_bounce_message", {
        p_provider: mapped.provider,
        p_provider_message_id: mapped.provider_message_id,
        p_campaign: mapped.campaign_id ?? null,
        p_lead: mapped.lead_id ?? null,
        p_subject: mapped.subject ?? "Delivery failure",
        p_body: mapped.body ?? "Delivery failed",
        p_received_at: mapped.received_at ?? new Date().toISOString(),
      })
      .catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}












