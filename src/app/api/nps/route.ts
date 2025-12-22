import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = "nodejs";

// GET: Check if NPS should be shown or get NPS data
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");

    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    // Check if should show NPS
    const { data: shouldShow } = await supabase.rpc("fn_should_show_nps", {
      p_org_id: orgId,
    });

    // Get latest NPS response
    const { data: latestResponse } = await supabase
      .from("nps_responses")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      should_show: shouldShow,
      latest_response: latestResponse,
    });
  } catch (error: any) {
    console.error("Error in NPS GET:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Submit NPS response
export async function POST(req: Request) {
  try {
    const { org_id, score, feedback } = await req.json();

    if (!org_id || typeof score !== "number") {
      return NextResponse.json(
        { error: "org_id and score required" },
        { status: 400 }
      );
    }

    if (score < 0 || score > 10) {
      return NextResponse.json(
        { error: "score must be between 0 and 10" },
        { status: 400 }
      );
    }

    // Submit via RPC function
    const { data, error } = await supabase.rpc("fn_submit_nps", {
      p_org_id: org_id,
      p_score: score,
      p_feedback: feedback || null,
    });

    if (error) {
      console.error("Error submitting NPS:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, response_id: data });
  } catch (error: any) {
    console.error("Error in NPS POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

