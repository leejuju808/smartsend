import { handleInboundReply } from "@/lib/inbound";

export async function POST(req: Request) {
  const body = await req.json();

  const mapped = {
    campaign_id: body.campaign_id,
    lead_id: body.lead_id,
    from_email: body.from,
    subject: body.subject || "",
    body_html: body.html || "",
    body_text: body.text || "",
    provider: 'outlook' as const,
    provider_message_id: body.message_id,
    provider_thread_id: body.thread_id || null,
    received_at: body.received_at || new Date().toISOString()
  };

  try {
    await handleInboundReply(mapped);
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(e?.message || "failed", { status: 400 });
  }
}

