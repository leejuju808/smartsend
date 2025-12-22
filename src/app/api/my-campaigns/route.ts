import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Get shared campaign IDs first
  const { data: shared } = await supabase
    .from("campaign_shares")
    .select("campaign_id")
    .eq("user_id", user.id);

  const sharedIds = (shared ?? []).map(s => s.campaign_id);

  // Fetch user's campaigns (owned or shared)
  let query = supabase
    .from("campaigns")
    .select("id, title, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (sharedIds.length > 0) {
    // Also get shared campaigns
    const { data: sharedCamps } = await supabase
      .from("campaigns")
      .select("id, title, name")
      .in("id", sharedIds)
      .order("created_at", { ascending: false });
    
    const { data: owned } = await query;
    const all = [...(owned ?? []), ...(sharedCamps ?? [])];
    // Remove duplicates
    const unique = Array.from(new Map(all.map(c => [c.id, c])).values());
    
    const rows = unique.map(c => ({
      id: c.id,
      name: c.title || c.name || "Untitled Campaign"
    }));
    return NextResponse.json({ rows });
  }

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Map to consistent format (handle both title and name columns)
  const rows = (data ?? []).map(c => ({
    id: c.id,
    name: c.title || c.name || "Untitled Campaign"
  }));

  return NextResponse.json({ rows });
}

