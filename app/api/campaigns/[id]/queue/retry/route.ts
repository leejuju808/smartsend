import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { error } = await supabase
      .from("send_queue")
      .update({
        status: "queued",
        attempts: 0,
        error: null,
        last_error: null,
      })
      .in("id", ids)
      .eq("campaign_id", params.id)
      .eq("status", "failed");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Retry failed" }, { status: 500 });
  }
}

