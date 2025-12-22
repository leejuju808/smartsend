// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "dev-verify-token";

// Helper to get Supabase client with service role
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// GET handler for webhook verification challenge
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST handler for incoming webhook events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // WhatsApp Cloud API format normalization (handles simple text messages)
    // Adjust if your provider differs.
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];

    // Fallback for generic providers (expecting { from, text } at root)
    const fromPhone = msg?.from || body.from || null;
    const text = msg?.text?.body || body.text || "";

    if (!fromPhone) {
      return NextResponse.json(
        { ok: false, error: "Missing from phone" },
        { status: 200 } // Return 200 so WhatsApp doesn't retry
      );
    }

    const supabase = getSupabase();

    // Upsert contact by phone (workspace-agnostic for MVP, add workspace_id filter in production)
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .upsert({ phone: fromPhone }, { onConflict: "phone" })
      .select()
      .single();

    if (contactError) {
      console.error("Contact upsert error:", contactError);
      return NextResponse.json(
        { ok: false, error: contactError.message },
        { status: 500 }
      );
    }

    // Store inbound message
    const { error: messageError } = await supabase.from("messages").insert({
      contact_id: contact?.id,
      direction: "inbound",
      provider: "whatsapp",
      payload: body,
      text,
      from_phone: fromPhone,
    });

    if (messageError) {
      console.error("Message insert error:", messageError);
      return NextResponse.json(
        { ok: false, error: messageError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
