import { createClient } from "@supabase/supabase-js";
import { mapGmailBounce } from "@/lib/bounce";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { Buffer } from "node:buffer";

async function verifyGoogle(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;

  const jwks = createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs")
  );

  try {
    await jwtVerify(auth.slice(7), jwks, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: process.env.GOOGLE_PUBSUB_AUDIENCE!,
    });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!(await verifyGoogle(req))) {
    return new Response("unauthorized", { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const raw = await req.json();
  const decoded = raw.message?.data
    ? JSON.parse(Buffer.from(raw.message.data, "base64").toString("utf8"))
    : raw;
  const mapped = mapGmailBounce(decoded);

  if (!mapped.provider_message_id) {
    return new Response("no message id", { status: 400 });
  }

  const { data, error } = await admin.rpc("upsert_bounce_message", {
    p_provider: mapped.provider,
    p_provider_message_id: mapped.provider_message_id,
    p_campaign: mapped.campaign_id ?? null,
    p_lead: mapped.lead_id ?? null,
    p_subject: mapped.subject ?? "Delivery failure",
    p_body: mapped.body ?? "Delivery failed",
    p_received_at: mapped.received_at ?? new Date().toISOString(),
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(
    JSON.stringify({ ok: true, inbox_message_id: data }),
    { headers: { "content-type": "application/json" } }
  );
}












