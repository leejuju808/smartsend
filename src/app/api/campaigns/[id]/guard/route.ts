import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: isOwner } = await supabase.rpc("is_campaign_owner", { p_campaign: params.id });
  if (!isOwner) return NextResponse.json({ error: "owner only" }, { status: 403 });

  // BLOCK 273000 — AUTOPILOT: owner cannot pause/resume while AUTOPILOT is ON.
  const { data: campRow } = await supabaseAdmin
    .from("campaigns")
    .select("workspace_id")
    .eq("id", params.id)
    .maybeSingle();
  const workspaceId = String((campRow as any)?.workspace_id || "");
  if (workspaceId) {
    const gate = await blockIfAutopilotEnabled({
      req,
      workspaceId,
      action: "Campaign guard action (pause/resume)",
    });
    if (gate.blocked) return gate.response;
  }

  const { action } = await req.json(); // 'resume' | 'pause'
  if (action === "pause") {
    const { error: pauseErr } = await supabase.rpc("guard_pause_campaign", { p_campaign: params.id, p_reason: "manual" });
    if (pauseErr) {
      if (String((pauseErr as any)?.message || "").includes("System performance indicates continuation")) {
        return NextResponse.json({ error: "System performance indicates continuation." }, { status: 423 });
      }
      return NextResponse.json({ error: pauseErr.message }, { status: 500 });
    }
    await supabase.rpc("log_audit", { 
      p_actor: user.id, 
      p_campaign: params.id, 
      p_entity_type: "campaign", 
      p_entity: params.id, 
      p_action: "guard_pause_manual", 
      p_meta: {} 
    });
  } else if (action === "resume") {
    const { error: resumeErr } = await supabase.rpc("guard_resume_campaign", { p_campaign: params.id });
    if (resumeErr) {
      if (String((resumeErr as any)?.message || "").includes("System performance indicates continuation")) {
        return NextResponse.json({ error: "System performance indicates continuation." }, { status: 423 });
      }
      return NextResponse.json({ error: resumeErr.message }, { status: 500 });
    }
    await supabase.rpc("log_audit", { 
      p_actor: user.id, 
      p_campaign: params.id, 
      p_entity_type: "campaign", 
      p_entity: params.id, 
      p_action: "guard_resume_manual", 
      p_meta: {} 
    });
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}



