import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

  const body = await req.json().catch(() => ({} as any));

  // Detect provider & normalize (SendGrid/Mailgun/Resend etc.)
  const provider = body?.provider ?? detectProvider(req, body);
  const account_id = body.account_id ?? body.customer_id ?? body.metadata?.account_id;
  const send_id = body.send_id ?? body.metadata?.send_id ?? body.sg_message_id ?? null;
  const lead_id = body.lead_id ?? body.metadata?.lead_id ?? null;

  const email =
    body.email ||
    body.recipient ||
    body.event?.recipient ||
    body?.to ||
    "";
  const smtp =
    body.smtp_code ||
    body["smtp-id"] ||
    body.smtp_response?.split(" ")[0] ||
    body.error ||
    body.code ||
    null;
  const dsn = body.dsn || body.dsn_code || null;

  if (!account_id || !email) {
    return NextResponse.json(
      { ok: false, error: "missing account_id/email" },
      { status: 400 }
    );
  }

  // Determine bounce type from provider payload
  let bounceType: 'hard' | 'soft' = 'soft';
  let bounceReason = smtp || dsn || 'Unknown bounce reason';
  
  // Hard bounce indicators
  const hardBounceCodes = ['550', '551', '552', '553', '554', '5.1.1', '5.1.2', '5.4.1', '5.4.2'];
  const hardBounceReasons = ['mailbox_not_found', 'user_not_found', 'invalid_recipient', 'rejected', 'blocked'];
  
  if (smtp && hardBounceCodes.some(code => String(smtp).includes(code))) {
    bounceType = 'hard';
  } else if (body.type === 'bounce' && body.reason === 'hard') {
    bounceType = 'hard';
  } else if (body.RecordType === 'Bounce' && body.Type === 'HardBounce') {
    bounceType = 'hard';
  } else if (hardBounceReasons.some(reason => bounceReason.toLowerCase().includes(reason))) {
    bounceType = 'hard';
  }
  
  // Use Block 11800 reputation guard bounce processing
  const providerMessageId = send_id || body.sg_message_id || body.message_id || body.MessageID || null;
  
  if (providerMessageId) {
    const { data: bounceResult, error: bounceError } = await supa.rpc("process_bounce_event", {
      p_provider_message_id: providerMessageId,
      p_bounce_type: bounceType,
      p_bounce_reason: bounceReason,
      p_email: String(email).toLowerCase(),
    });
    
    if (bounceError) {
      console.error("Block 11800 bounce processing error:", bounceError);
      // Fall through to legacy handler if new handler fails
    } else if (bounceResult) {
      // Successfully processed with reputation guard
      return NextResponse.json({ 
        ok: true, 
        processed: true,
        guard_result: bounceResult 
      });
    }
  }
  
  // Legacy bounce handler (fallback)
  const { error } = await supa.rpc("rpc_record_bounce", {
    p_account_id: account_id,
    p_send_id: send_id,
    p_lead_id: lead_id,
    p_email: String(email).toLowerCase(),
    p_smtp_code: smtp,
    p_dsn_code: dsn,
    p_provider: provider,
    p_raw: body,
  });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function detectProvider(req: NextRequest, body: any) {
  const ua = req.headers.get("user-agent") || "";
  if (ua.includes("SendGrid")) return "sendgrid";
  if (ua.includes("Mailgun")) return "mailgun";
  if (ua.includes("Resend")) return "resend";
  return body?.provider || "unknown";
}
