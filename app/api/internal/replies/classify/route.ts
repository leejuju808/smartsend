// Block 8340 — Example: How SmartSend Calls This Function
// In your Next.js / API route / server action, after you insert a new campaign_replies row
// from your inbound webhook, you can fire-and-forget this classification

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { replyId } = await req.json();

  if (!replyId) {
    return NextResponse.json({ error: "Missing replyId" }, { status: 400 });
  }

  try {
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/classify-reply-block8340`;

    await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Optional: add a shared secret header to match the Edge Function check
        // Authorization: `Bearer ${process.env.INTERNAL_FUNCTION_SECRET}`,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ reply_id: replyId }),
    });

    // We don't block the request on classification; just acknowledge
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to invoke classify-reply:", e);
    return NextResponse.json({ error: "Invocation failed" }, { status: 500 });
  }
}

// Example usage in your inbound handler (Gmail / Outlook / webhook):
/*
const { data, error } = await supabase
  .from("campaign_replies")
  .insert({
    campaign_id,
    lead_id,
    subject,
    raw_text: replyBody,
    from_email,
    to_email,
    // other fields…
  })
  .select("id")
  .single();

if (!error && data?.id) {
  // Trigger classification (fire-and-forget)
  await fetch("/api/internal/replies/classify", {
    method: "POST",
    body: JSON.stringify({ replyId: data.id }),
    headers: { "Content-Type": "application/json" },
  }).catch((err) => {
    console.error("Failed to trigger classification:", err);
    // Don't fail the main request if classification fails
  });
}
*/































































