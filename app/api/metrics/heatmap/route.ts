import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/sb";

export async function GET(req: NextRequest) {
  const supabase = admin();

  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId)
    return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const { data, error } = await supabase.rpc("get_heatmap", {
    p_account: accountId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}














