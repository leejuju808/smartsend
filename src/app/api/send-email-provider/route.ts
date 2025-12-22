// app/api/send-email-provider/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { providerSend } from "@/lib/providers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Verify request is from our system
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SEND_DAEMON_SECRET;
    
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { account_id, to, subject, text, html } = await req.json();

    if (!account_id || !to || !subject) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch account (server-side; use service key in server runtime or RLS that allows needed columns)
    const { data: acct, error: acctErr } = await supabase
      .from("connected_accounts")
      .select("id, provider, smtp_settings")
      .eq("id", account_id)
      .maybeSingle();

    if (acctErr || !acct) {
      return NextResponse.json({ 
        error: `no_account:${acctErr?.message ?? "missing"}` 
      }, { status: 404 });
    }

    // Call provider via router
    const res = await providerSend(acct as any, {
      to,
      subject,
      text,
      html,
    });

    if (res.ok) {
      return NextResponse.json({ 
        ok: true, 
        provider: acct.provider,
        message_id: res.messageId,
        provider_message_id: res.messageId 
      });
    } else {
      return NextResponse.json({ 
        ok: false, 
        error: res.error || "provider_fail",
        provider: acct.provider 
      }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ 
      error: e.message || "Internal server error" 
    }, { status: 500 });
  }
}
