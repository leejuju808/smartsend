import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { thread_id } = await req.json();

    // If thread_id is provided, reset its generated_at to force refresh
    if (thread_id) {
      const { error: resetError } = await supabase
        .from("ai_sdr_threads")
        .update({ next_best_action_generated_at: null })
        .eq("id", thread_id);

      if (resetError) {
        console.error("Error resetting NBM timestamp:", resetError);
        return NextResponse.json(
          { error: "Failed to reset NBM timestamp" },
          { status: 500 }
        );
      }
    }

    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-sdr-next-best-actions`;
    
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: errorText || "Failed to generate next best actions" },
        { status: res.status }
      );
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error: any) {
    console.error("Error in next-best-actions route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


