import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/sb";

export async function GET(req: NextRequest) {
  const supabase = admin();

  const accountId = req.nextUrl.searchParams.get("accountId");
  const provider = req.nextUrl.searchParams.get("provider"); // Optional filter
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  let query = supabase
    .from("v_metrics_overview")
    .select("*")
    .eq("account_id", accountId);

  // Note: v_metrics_overview doesn't have provider column, so provider filter would need to be applied at source
  // For now, we'll return all providers. To add provider filter, we'd need to modify the view or query send_queue directly

  const { data, error } = await query.maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    ok: true,
    data: data ?? {
      account_id: accountId,
      sent_today: 0,
      failed_today: 0,
      dead_today: 0,
      bounces_today: 0,
      complaints_today: 0,
    },
  });
}

