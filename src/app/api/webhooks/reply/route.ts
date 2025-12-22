import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Expect/normalize keys here from the provider:
    // e.g., Resend inbound: payload.headers["message-id"], payload.from, payload.to, payload.subject, payload.text
    const external_id = payload["message-id"] || payload.headers?.["message-id"] || payload.id;
    const from_email = payload.from?.address || payload.from || payload.mail_from || "";
    const to_email = Array.isArray(payload.to) ? payload.to[0]?.address : (payload.to?.address || payload.to || "");
    const subject = payload.subject || "";
    const body = payload.text || payload.html || "";

    // Optional: if you included custom vars, pass them through
    const campaign_id = payload.campaign_id || payload.headers?.["x-campaign-id"];
    const lead_id = payload.lead_id || payload.headers?.["x-lead-id"];
    const thread_id = payload.thread_id || payload.headers?.["x-thread-id"];

    const forwarded = {
      provider: "resend", // or "gmail", "outlook", etc.
      external_id,
      from_email,
      to_email,
      subject,
      body,
      campaign_id,
      lead_id,
      thread_id,
    };

    const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/replyDetection`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": process.env.REPLY_WEBHOOK_SECRET!,
      },
      body: JSON.stringify(forwarded),
      cache: "no-store",
    });

    const json = await resp.json();
    return NextResponse.json(json, { status: resp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Bad payload" }, { status: 400 });
  }
}
