import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/sb";

export async function GET(req: NextRequest) {
  const supabase = admin();

  const accountId = req.nextUrl.searchParams.get("accountId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "5", 10);
  
  if (!accountId)
    return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const { data, error } = await supabase.rpc("get_top_errors", {
    p_account: accountId,
    p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}














