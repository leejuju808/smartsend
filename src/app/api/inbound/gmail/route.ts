import { handleInboundReply } from "@/lib/inbound";
import { jwtVerify, createRemoteJWKSet } from "jose";

async function verifyGoogleJwt(authHeader: string | null, audience: string): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);

  // Google public keys via JWKS URL
  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

  try {
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience,
    });
    return !!payload && !!protectedHeader;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // Verify Google signature/JWT
  const audience = process.env.GOOGLE_PUBSUB_AUDIENCE || process.env.NEXT_PUBLIC_SITE_URL + "/api/inbound/gmail";
  const ok = await verifyGoogleJwt(req.headers.get("authorization"), audience);
  if (!ok) return new Response("unauthorized", { status: 401 });

  // Map your message format (assuming you decode Pub/Sub message upstream)
  const body = await req.json();

  // TODO: decode Pub/Sub message.data (base64) into your Gmail payload shape.
  const gmail = body.message?.data
    ? JSON.parse(Buffer.from(body.message.data, "base64").toString("utf8"))
    : body; // fallback for local tests

  const mapped = {
    campaign_id: gmail.campaign_id,
    lead_id: gmail.lead_id,
    from_email: gmail.from,
    subject: gmail.subject || "",
    body_html: gmail.html || "",
    body_text: gmail.text || "",
    provider: 'gmail' as const,
    provider_message_id: gmail.message_id,
    provider_thread_id: gmail.thread_id || null,
    received_at: gmail.received_at || new Date().toISOString(),
  };

  try {
    await handleInboundReply(mapped);
    return new Response(JSON.stringify({ ok: true }), { 
      headers: { "content-type": "application/json" }
    });
  } catch (e: any) {
    return new Response(e?.message || "failed", { status: 400 });
  }
}
