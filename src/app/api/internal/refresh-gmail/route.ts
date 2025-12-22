import { NextResponse } from "next/server";
import { refreshIfNeeded, getWorkspaceGmail } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const key = req.headers.get("x-worker-key");
    if ((process.env.WORKER_SECRET || "") !== key) {
      return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
    }

    const { connectedAccountId } = await req.json();
    
    let { data: row, error } = await supabaseAdmin
      .from("connected_accounts")
      .select("*")
      .eq("id", connectedAccountId)
      .maybeSingle();
      
    if (error || !row) throw new Error("Account not found");

    row = await refreshIfNeeded(row);

    return NextResponse.json({
      ok: true,
      accessToken: row.access_token,
      fromEmail: row.account_email,
    });
  } catch (e: any) {
    console.error("Refresh Gmail error:", e);
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
