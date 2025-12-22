import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/sb";

export async function GET(req: NextRequest) {
  const supabase = admin();

  const q = req.nextUrl.searchParams;
  const accountId = q.get("accountId");
  const from = q.get("from");
  const to = q.get("to");
  const provider = q.get("provider"); // Optional filter
  if (!accountId || !from || !to)
    return NextResponse.json({ error: "accountId, from, to required" }, { status: 400 });

  // Note: get_timeseries RPC doesn't support provider filter yet
  // To add provider filter, we'd need to modify the RPC or filter results here
  const { data, error } = await supabase.rpc("get_timeseries", {
    p_account: accountId,
    p_from: new Date(from).toISOString(),
    p_to: new Date(to).toISOString(),
  });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  // Filter by provider if provided (note: this requires provider column in result)
  let filteredData = data;
  if (provider && data) {
    // This would work if the timeseries data includes provider column
    // For now, we return all data
  }
  
  return NextResponse.json({ ok: true, data: filteredData });
}

