import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/owner/tour
 * Mark inbox tour as completed
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ has_seen_inbox_tour: true })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating tour status:", updateError);
      return NextResponse.json(
        { error: "Failed to update tour status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error completing tour:", error);
    return NextResponse.json(
      { error: "Failed to complete tour" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/owner/demo-dismiss
 * Mark demo data as dismissed
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { dismissed } = await req.json().catch(() => ({ dismissed: true }));

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ inbox_demo_dismissed: dismissed })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating demo dismiss status:", updateError);
      return NextResponse.json(
        { error: "Failed to update demo dismiss status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error dismissing demo:", error);
    return NextResponse.json(
      { error: "Failed to dismiss demo" },
      { status: 500 }
    );
  }
}



















































