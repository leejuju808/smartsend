import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { replyIds } = await req.json();
    
    if (!replyIds || !Array.isArray(replyIds) || replyIds.length === 0) {
      return NextResponse.json(
        { error: { message: "replyIds array required" } },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Get session user for auditing
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates = {
      status: "handled",
      handled_by: user.id,
      handled_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("replies")
      .update(updates)
      .in("id", replyIds);

    if (error) {
      console.error("Error bulk updating replies:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Try to mark leads as replied (best-effort, don't fail if it errors)
    const { data: replies } = await supabase
      .from("replies")
      .select("lead_id")
      .in("id", replyIds);

    if (replies && replies.length > 0) {
      const leadIds = [...new Set(replies.map((r) => r.lead_id).filter(Boolean))];
      for (const leadId of leadIds) {
        await supabase.rpc('mark_lead_replied', {
          p_lead_id: leadId,
          p_reply_id: null
        }).catch(() => {}); // Silent fail
      }
    }

    return NextResponse.json({ ok: true, updated: replyIds.length });
  } catch (e: any) {
    console.error("Error in bulk handle:", e);
    return NextResponse.json(
      { error: { message: e?.message ?? "Unexpected error" } },
      { status: 500 }
    );
  }
}

