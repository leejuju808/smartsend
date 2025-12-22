import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { setAccountContext } from "@/app/api/_utils/account";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const accountId = await setAccountContext(supabase);

  if (!accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { leadA, leadB, reason } = body;

  if (!leadA || !leadB || !reason) {
    return NextResponse.json(
      { error: "leadA, leadB, and reason are required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("merge_queue").insert({
    account_id: accountId,
    lead_a: leadA,
    lead_b: leadB,
    reason,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}












