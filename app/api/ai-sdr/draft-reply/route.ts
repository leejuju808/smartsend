import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { thread_id, lead_id, thread, persona_prompt, sdr_notes } = body;

    // Support both new format (lead_id + thread) and legacy format (thread_id)
    const payload: any = { user_id: user.id };
    
    if (lead_id && thread) {
      // New Block 501 format
      payload.lead_id = lead_id;
      payload.thread = thread;
      if (persona_prompt) payload.persona_prompt = persona_prompt;
      if (sdr_notes) payload.sdr_notes = sdr_notes;
    } else if (thread_id) {
      // Legacy format
      payload.thread_id = thread_id;
    } else {
      return NextResponse.json(
        { error: "Either (lead_id + thread) or thread_id is required" },
        { status: 400 }
      );
    }

    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-sdr-draft-reply`;
    
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: errorText || "Failed to generate draft" },
        { status: res.status }
      );
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error: any) {
    console.error("Error in draft-reply route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


