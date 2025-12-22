import { handleInboundReply } from "@/lib/inbound";

// Initial validation ping: Graph sends a GET with validationToken
export async function GET(req: Request) {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationtoken") || url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response("OK");
}

export async function POST(req: Request) {
  const body = await req.json();

  // Verify clientState on every notification
  const notifications = Array.isArray(body?.value) ? body.value : [body];
  for (const n of notifications) {
    if (n.clientState !== process.env.MS_GRAPH_CLIENT_STATE) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  // Assume you've resolved the resource into the email payload elsewhere (queue worker),
  // but for this minimal slice we accept mapped fields in the body:
  for (const n of notifications) {
    const mapped = {
      campaign_id: n.campaign_id,
      lead_id: n.lead_id,
      from_email: n.from,
      subject: n.subject || "",
      body_html: n.html || "",
      body_text: n.text || "",
      provider: 'outlook' as const,
      provider_message_id: n.message_id,
      provider_thread_id: n.thread_id || null,
      received_at: n.received_at || new Date().toISOString(),
    };

    try {
      await handleInboundReply(mapped);
    } catch (e) {
      // swallow per-notification errors to ack the batch
    }
  }

  return new Response(JSON.stringify({ ok: true }), { 
    headers: { "content-type": "application/json" }
  });
}
