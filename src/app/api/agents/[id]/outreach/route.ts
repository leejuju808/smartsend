import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// POST /api/agents/[id]/outreach - Trigger outreach for an agent
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

    const body = await req.json();
    const { limit = 10 } = body;

    // Invoke the ai-outreach edge function
    const { data, error } = await supabase.functions.invoke("ai-outreach", {
      body: {
        agent_id: params.id,
        limit,
      },
    });

    if (error) {
      console.error("Error invoking ai-outreach:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("Error in POST /api/agents/[id]/outreach:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

