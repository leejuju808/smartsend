import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const verifyToken = Deno.env.get("WHATSAPP_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (token === verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages || [];

    for (const m of messages) {
      const from = m.from;
      const text = m.text?.body;

      if (!from || !text) continue;

      const { data: lead } = await supabase
        .from("leads")
        .select("id, org_id")
        .eq("phone", from)
        .maybeSingle();

      if (lead) {
        const { data: newMessage } = await supabase.from("channel_messages").insert({
          org_id: lead.org_id,
          lead_id: lead.id,
          channel: "whatsapp",
          direction: "inbound",
          body: text,
          status: "delivered",
          metadata: { message_id: m.id, timestamp: m.timestamp },
        }).select().single();

        // Trigger AI reply handler
        if (newMessage) {
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-reply-handler`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ message_id: newMessage.id }),
            }).catch((err) => {
              console.error("Failed to trigger ai-reply-handler:", err);
            });
          } catch (error) {
            console.error("Failed to trigger ai-reply-handler:", error);
          }
        }

        // Trigger automation for WhatsApp reply
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/automation-runner`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              event_type: "reply_whatsapp",
              lead_id: lead.id,
              org_id: lead.org_id,
            }),
          }).catch((err) => {
            console.error("Failed to trigger automation:", err);
          });
        } catch (error) {
          console.error("Failed to trigger automation:", error);
        }
      }
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});

