import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params:{ id:string }}) {
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

  const { data: seg } = await supabase.from("segments").select("workspace_id,definition").eq("id", params.id).single();
  if (!seg || seg.workspace_id !== workspaceId) return NextResponse.json({ ok:false, error:"Not found" }, { status:404 });

  // For now, return a simple preview - in a real implementation, you'd need to build the filter
  // based on the segment definition and apply it to the contacts query
  // TODO: Implement proper segment filtering using buildContactsFilter
  const { data, error } = await supabase
    .from("contacts")
    .select("id,email,first_name,last_name,company,tags,attrs")
    .eq("workspace_id", workspaceId)
    .limit(500);

  if (error) return NextResponse.json({ ok:false, error:String(error) }, { status:500 });
  return NextResponse.json({ ok:true, contacts: data ?? [] });
}