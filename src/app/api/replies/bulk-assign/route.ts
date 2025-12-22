import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { replyIds, userId } = await req.json();
    
    if (!replyIds || !Array.isArray(replyIds) || replyIds.length === 0) {
      return NextResponse.json(
        { error: { message: "replyIds array required" } },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: { message: "userId required" } },
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
      handled_by: userId,
    };

    const { error } = await supabase
      .from("replies")
      .update(updates)
      .in("id", replyIds);

    if (error) {
      console.error("Error bulk assigning replies:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, updated: replyIds.length });
  } catch (e: any) {
    console.error("Error in bulk assign:", e);
    return NextResponse.json(
      { error: { message: e?.message ?? "Unexpected error" } },
      { status: 500 }
    );
  }
}

