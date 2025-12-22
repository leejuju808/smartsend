import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const eventId = params.id;

    // Update event to resolved
    const { error } = await supabase
      .from("enterprise_events")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: user.id,
      })
      .eq("id", eventId);

    if (error) {
      console.error("Error resolving event:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in resolve event API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}






















