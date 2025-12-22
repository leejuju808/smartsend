import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", u.user.id)
      .single();

    const workspaceId = profile?.workspace_id;
    if (!workspaceId) return NextResponse.json({ ok:false, error:"No workspace found" }, { status:400 });

    const { data: sequences, error } = await supabase
      .from("sequences")
      .select("id, name, status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, sequences: sequences || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch sequences" }, { status: 500 });
  }
}

/**
 * POST body:
 * {
 *   workspaceId: string,
 *   name: string,
 *   steps: Array<{ step_order:number, subject_template:string, body_text_template:string, delay_minutes?:number }>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", u.user.id)
      .single();

    const workspaceId = profile?.workspace_id;
    if (!workspaceId) return NextResponse.json({ ok:false, error:"No workspace found" }, { status:400 });

    const { workspaceId: bodyWorkspaceId, name, steps } = await req.json();
    if (!bodyWorkspaceId || !name || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "workspaceId, name, steps required" }, { status: 400 });
    }
    
    // Check limit BEFORE insert (only if status will be 'active' by default)
    // Note: sequences are created with status='active' by default per migration
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const limitRes = await fetch(`${appUrl}/api/limits/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: bodyWorkspaceId,
        kind: "sequences",
        delta: 1,
      }),
    });

    const limitJson = await limitRes.json();
    if (limitJson.status === "blocked") {
      return NextResponse.json(
        {
          ok: false,
          error: "sequences_limit",
          message: "You can only have up to 5 active sequences in this workspace.",
        },
        { status: 403 }
      );
    }
    
    const { data: seq, error: sErr } = await supabase
      .from("sequences")
      .insert({ workspace_id: bodyWorkspaceId, name })
      .select("id")
      .single();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const rows = steps.map((s: any) => ({
      sequence_id: seq.id,
      step_order: s.step_order,
      subject_template: s.subject_template,
      body_text_template: s.body_text_template,
      delay_minutes: s.delay_minutes ?? 0
    }));
    const { error: stErr } = await supabase.from("sequence_steps").insert(rows);
    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, sequenceId: seq.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create sequence" }, { status: 500 });
  }
}