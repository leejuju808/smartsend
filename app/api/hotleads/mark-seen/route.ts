// app/api/hotleads/mark-seen/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase
    .from("hot_lead_events")
    .update({ was_seen: true })
    .eq("owner_id", user.id)
    .eq("was_seen", false);

  if (error) {
    console.error("Hot leads mark seen error:", error);
    return NextResponse.json(
      { error: "Failed to mark as seen" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

























































