import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { accountId, action, value, queueIds } = await req.json();
    if (!accountId || !action || !Array.isArray(queueIds) || !queueIds.length) {
      return NextResponse.json(
        { error: "accountId, action, and queueIds[] required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { error } = await supabase.rpc("triage_fix", {
      p_account: accountId,
      p_action: action,
      p_value: value ?? "",
      p_queue_ids: queueIds,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("triage fix error", error);
    return NextResponse.json(
      { error: "Failed to apply fix" },
      { status: 500 }
    );
  }
}














