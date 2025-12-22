import { createClient } from "@/utils/supabase/server";

export async function ingestInboundReply(payload: {
  accountId: string;
  sendLogId: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  rawText: string;
}) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("email_replies")
    .insert({
      account_id: payload.accountId,
      send_log_id: payload.sendLogId,
      from_email: payload.fromEmail,
      to_email: payload.toEmail,
      subject: payload.subject,
      raw_text: payload.rawText,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to insert reply");
  }

  // Fire-and-forget AI detection (no need to await in request path)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  fetch(`${appUrl}/api/replies/ai-detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replyId: data.id }),
  }).catch((err) => {
    console.error("Failed to queue AI detection", err);
  });

  return data.id;
}

