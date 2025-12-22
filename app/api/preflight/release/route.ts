import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { queueId } = await req.json();
    
    if (!queueId) {
      return NextResponse.json({ error: "queueId required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Move a held row back to pending (human override)
    const { error } = await supabase
      .from("send_queue")
      .update({ 
        status: "pending", 
        released_at: new Date().toISOString() 
      })
      .eq("id", queueId)
      .eq("status", "held_preflight");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("preflight release error", error);
    return NextResponse.json(
      { error: "Failed to release email" },
      { status: 500 }
    );
  }
}














