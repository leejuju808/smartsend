import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = params.id;
    const updates = await req.json();

    // Verify sender belongs to user before updating
    const { data: sender, error: checkError } = await supabase
      .from("sender_identities")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (checkError || !sender) {
      return NextResponse.json(
        { error: "Sender not found" },
        { status: 404 }
      );
    }

    // Update sender identity
    const { error } = await supabase
      .from("sender_identities")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("Error updating warmup settings:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in POST /api/senders/[id]/warmup/update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



