import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { workspaceId } = await req.json();
    
    if (!workspaceId) {
      return NextResponse.json({ ok: false, message: "workspaceId required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("send_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ ok: true, settings: data ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
