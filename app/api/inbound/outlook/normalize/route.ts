import { NextRequest, NextResponse } from "next/server";

type OutlookAddress = {
  emailAddress?: {
    address?: string;
  };
};

type OutlookPayload = {
  id: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  subject?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  from?: OutlookAddress;
  toRecipients?: OutlookAddress[];
  receivedDateTime?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OutlookPayload;

    if (!body?.id || !body?.campaign_id || !body?.thread_id || !body?.lead_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const isHtml = (body.body?.contentType ?? "").toLowerCase() === "html";
    const bodyHtml = isHtml ? (body.body?.content ?? "") : "";
    const bodyPlain = isHtml ? "" : body.body?.content ?? "";

    const normalized = {
      provider: "outlook" as const,
      provider_message_id: body.id,
      campaign_id: body.campaign_id,
      thread_id: body.thread_id,
      lead_id: body.lead_id,
      subject: body.subject ?? "",
      body_html: bodyHtml,
      body_plain: bodyPlain,
      from_email: body.from?.emailAddress?.address ?? "",
      to_email: body.toRecipients?.[0]?.emailAddress?.address ?? "",
      received_at: body.receivedDateTime ?? new Date().toISOString(),
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_SUPABASE_URL not configured" }, { status: 500 });
    }

    const secret = process.env.INBOUND_WEBHOOK_SECRET;
    const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/inbound-ingest`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-inbound-secret": secret } : {}),
      },
      body: JSON.stringify(normalized),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: result?.error ?? "ingest failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}




