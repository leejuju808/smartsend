import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
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

  const q = new URL(req.url).searchParams;
  const search = (q.get("q") || "").trim();
  const leadSourceFilter = q.get("source"); // Block 15300: Lead source filter
  const ownerFilter = q.get("owner"); // Block 16300: Owner filter ("me" | user_id | null)
  let query = supabase.from("contacts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending:false }).limit(200);
  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`);
  }
  if (leadSourceFilter) {
    query = query.eq("lead_source", leadSourceFilter);
  }
  // Block 16300: Apply owner filter
  if (ownerFilter === "me") {
    query = query.eq("owner_user_id", u.user.id);
  } else if (ownerFilter && ownerFilter !== "me") {
    query = query.eq("owner_user_id", ownerFilter);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true, contacts:data });
}

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(()=>({}));
  const { email, first_name, last_name, company, tags, attrs } = body ?? {};
  if (!email) return NextResponse.json({ ok:false, error:"email required" }, { status:400 });

  const row = {
    workspace_id: workspaceId,
    email: String(email).toLowerCase(),
    first_name: first_name ?? null,
    last_name: last_name ?? null,
    company: company ?? null,
    tags: Array.isArray(tags) ? tags : null,
    attrs: (attrs && typeof attrs === "object") ? attrs : null,
    owner_user_id: u.user.id, // Block 16300: Default owner = creator
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("contacts").upsert(row, { onConflict: "workspace_id,email" });
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  
  // Auto-merge exact duplicates after creating/updating contact
  try {
    await supabase.rpc("auto_merge_exact_duplicates", { p_workspace_id: workspaceId });
  } catch (e) {
    // Don't fail the request if auto-merge fails
    console.warn("Auto-merge after contact creation failed:", e);
  }
  
  return NextResponse.json({ ok:true });
}