import { NextRequest, NextResponse } from "next/server";

type GmailPayload = {
  id: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  body_html?: string;
  body_plain?: string;
  from?: string;
  to?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
  internalDate?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GmailPayload;

    if (!body?.id || !body?.campaign_id || !body?.thread_id || !body?.lead_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const subject = body.payload?.headers?.find((h) => (h?.name ?? "").toLowerCase() === "subject")?.value ?? "";

    const normalized = {
      provider: "gmail" as const,
      provider_message_id: body.id,
      campaign_id: body.campaign_id,
      thread_id: body.thread_id,
      lead_id: body.lead_id,
      subject,
      body_html: body.body_html ?? "",
      body_plain: body.body_plain ?? "",
      from_email: body.from ?? "",
      to_email: body.to ?? "",
      received_at: body.internalDate
        ? new Date(Number(body.internalDate)).toISOString()
        : new Date().toISOString(),
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




