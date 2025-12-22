import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/monitoring/sentry";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { lead_id, body } = await req.json();

    if (!lead_id || !body) {
      return NextResponse.json(
        { ok: false, error: "Missing lead_id or body" },
        { status: 400 }
      );
    }

    // Call the WhatsApp send Edge Function
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: { lead_id, body },
    });

    if (error) {
      console.error("WhatsApp send error:", error);
      captureError(error, { service: 'whatsapp-send', lead_id, has_body: !!body });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Error in WhatsApp send API:", error);
    captureError(error, { service: 'whatsapp-send-api' });
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

