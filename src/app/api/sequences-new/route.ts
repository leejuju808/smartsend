import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); 
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  
  const { data, error } = await supabase
    .from("sequences")
    .select("*")
    .eq("workspace_id", u.user.id)
    .order("created_at", { ascending: false });
    
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true, sequences: data });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); 
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  const campaign_id = body.campaignId || null;
  
  if (!name) return NextResponse.json({ ok:false, error:"name required" }, { status:400 });
  
  // Check limit BEFORE insert (sequences are created with status='active' by default)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const limitRes = await fetch(`${appUrl}/api/limits/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: u.user.id,
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
  
  const { error } = await supabase
    .from("sequences")
    .insert({ workspace_id: u.user.id, name, campaign_id });
    
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
}