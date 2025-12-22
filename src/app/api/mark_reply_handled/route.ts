import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = getServerSupabase();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { reply_id } = await req.json();

    if (!reply_id) {
      return NextResponse.json(
        { error: "reply_id is required" },
        { status: 400 }
      );
    }

    // Update the reply
    const { data, error } = await supabase
      .from("replies")
      .update({
        handled_by: user.id,
        status: "handled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reply_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("mark_reply_handled error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

