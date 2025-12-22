import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/safety/analyze_list
 * 
 * SmartSend Safety Net v1 - List Quality Analysis
 * Analyzes email list quality before sending to prevent domain burn
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { workspace_id, email_list } = body;

    if (!workspace_id || !Array.isArray(email_list)) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: workspace_id, email_list (array)" },
        { status: 400 }
      );
    }

    if (email_list.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Email list cannot be empty" },
        { status: 400 }
      );
    }

    // Use Safety Net's analyze_list_quality function
    const { data, error } = await supabase.rpc('analyze_list_quality', {
      p_workspace_id: workspace_id,
      p_email_list: email_list
    });

    if (error) {
      console.error('Error analyzing list quality:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      analysis: data
    });
  } catch (error: any) {
    console.error('List analysis error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































