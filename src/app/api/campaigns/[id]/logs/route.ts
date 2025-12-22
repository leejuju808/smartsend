import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user can view this campaign (RLS will also enforce this)
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Fetch logs with actor and target user info
  // Note: We'll need to join with profiles or use RPC to get emails
  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      id, 
      action, 
      created_at, 
      target_email, 
      target_user_id, 
      meta,
      actor_id
    `)
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Get unique user IDs for actor and target
  const userIds = new Set<string>();
  data?.forEach(log => {
    if (log.actor_id) userIds.add(log.actor_id);
    if (log.target_user_id) userIds.add(log.target_user_id);
  });

  // Fetch emails for users (if profiles table exists)
  let emailMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", Array.from(userIds));
    
    profiles?.forEach(p => {
      if (p.email) {
        emailMap.set(p.id, p.email);
      }
    });
  }

  // Format response with actor and target emails
  const logs = data?.map(log => ({
    id: log.id,
    action: log.action,
    created_at: log.created_at,
    target_email: log.target_email,
    target_user_id: log.target_user_id,
    meta: log.meta,
    actor: log.actor_id ? {
      id: log.actor_id,
      email: emailMap.get(log.actor_id) || null
    } : null,
    target: log.target_user_id ? {
      id: log.target_user_id,
      email: emailMap.get(log.target_user_id) || null
    } : null
  })) ?? [];

  return NextResponse.json({ logs });
}

