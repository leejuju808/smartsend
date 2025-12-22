// /app/api/gmail/push/route.ts
import { NextResponse } from "next/server";
import { gmail, getOAuthClient } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Optional: simple shared-secret to verify Pub/Sub (set in subscription push config)
function verifySecret(req: Request) {
  const token = req.headers.get("x-pubsub-token");
  return token && token === process.env.PUBSUB_VERIFICATION_TOKEN!;
}

// helper: fetch full message payload
async function getMessage(g: ReturnType<typeof gmail>, id: string) {
  const res = await g.users.messages.get({ userId: "me", id, format: "full" });
  return res.data;
}

function header(msg: any, name: string) {
  return msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function POST(req: Request) {
  try {
    if (!verifySecret(req)) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    // Pub/Sub envelope
    const message = body?.message;
    if (!message?.data) return NextResponse.json({ ok: true, note: "no data" });

    // Gmail push data
    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString("utf-8"));
    const { emailAddress, historyId } = decoded as { emailAddress: string; historyId: string };

    // Find integration by email (MVP assumes one integration per workspace)
    const { data: integ, error } = await supabaseAdmin
      .from("integrations_gmail")
      .select("*")
      .eq("email", emailAddress)
      .single();
    if (error || !integ) throw new Error("Integration not found for " + emailAddress);

    const { oauth2Client } = await getOAuthClient(integ.workspace_id);
    const g = gmail(oauth2Client);

    // List history since last known point
    const hist = await g.users.history.list({
      userId: "me",
      startHistoryId: integ.last_history_id ?? historyId,
      historyTypes: ["messageAdded", "labelAdded"],
      maxResults: 50,
    });

    const history = hist.data.history ?? [];
    const newMessageIds = new Set<string>();

    for (const h of history) {
      (h.messagesAdded ?? []).forEach((m) => m.message?.id && newMessageIds.add(m.message.id));
    }

    // Process each new message → call reply-webhook
    for (const id of newMessageIds) {
      const m = await getMessage(g, id);
      if (!m || !m.payload) continue;

      const subject = header(m, "Subject");
      const from = header(m, "From");
      const threadId = m.threadId ?? null;

      // crude body extraction (text/plain first)
      let bodyText = "";
      
      function getBody(part: any): string {
        if (part.body?.data) {
          try {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          } catch (e) {
            console.error("Error decoding body:", e);
            return "";
          }
        }
        return "";
      }

      // Handle multipart messages
      if (m.payload.parts && m.payload.parts.length > 0) {
        const plain = m.payload.parts.find((p: any) => p.mimeType === "text/plain");
        const html = m.payload.parts.find((p: any) => p.mimeType === "text/html");
        const pick = plain ?? html ?? m.payload.parts[0];
        bodyText = getBody(pick);
      } else if (m.payload.body) {
        // Single-part message
        bodyText = getBody(m.payload);
      }

      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-webhook`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          workspace_id: integ.workspace_id,
          thread_id: threadId,
          from,
          subject,
          snippet: m.snippet ?? "",
          text: bodyText.slice(0, 5000),
          provider: "gmail",
        }),
      });
    }

    // Advance stored history cursor
    await supabaseAdmin
      .from("integrations_gmail")
      .update({
        last_history_id: historyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integ.id);

    return NextResponse.json({ ok: true, processed: Array.from(newMessageIds).length });
  } catch (e: any) {
    console.error("gmail/push error", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
} 