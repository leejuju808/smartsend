import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { enabled } = await req.json();
    
    const { error } = await supabase
      .from("campaigns")
      .update({ auto_stop_on_reply: !!enabled })
      .eq("id", params.id);

    if (error) {
      console.error("Error updating campaign auto_stop_on_reply:", error);
      return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, auto_stop_on_reply: !!enabled });
  } catch (error) {
    console.error("Error in toggle-auto-stop:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 