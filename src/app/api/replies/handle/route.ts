import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { reply_id, internal_note, assignee } = await req.json();
    
    if (!reply_id) {
      return NextResponse.json(
        { error: { message: "reply_id required" } },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Get session user (auditing)
    const { data: { user } } = await supabase.auth.getUser();

    const updates: Record<string, any> = {
      status: "handled",
      internal_note: internal_note ?? null,
      handled_by: assignee ?? user?.id ?? null,
      handled_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("replies")
      .update(updates)
      .eq("id", reply_id);

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    // Optional: Mark lead as replied to pause sequences
    // First, get the lead_id from the reply
    const { data: reply } = await supabase
      .from("replies")
      .select("lead_id")
      .eq("id", reply_id)
      .single();

    if (reply?.lead_id) {
      // Call RPC to mark lead as replied (best-effort, don't fail if it errors)
      await supabase.rpc('mark_lead_replied', {
        p_lead_id: reply.lead_id,
        p_reply_id: reply_id
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? "Unexpected error" } },
      { status: 500 }
    );
  }
}

