import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
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

    // Fetch sender identity with user ownership check
    const { data: sender, error: senderError } = await supabase
      .from("sender_identities")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (senderError || !sender) {
      return NextResponse.json(
        { error: "Sender not found" },
        { status: 404 }
      );
    }

    // Fetch warmup logs
    const { data: logs, error: logsError } = await supabase
      .from("warmup_logs")
      .select("*")
      .eq("sender_id", id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (logsError) {
      console.error("Error fetching warmup logs:", logsError);
      // Don't fail the request if logs fail, just return empty array
    }

    return NextResponse.json({
      sender,
      logs: logs || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/senders/[id]/warmup:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



