import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { user_id } = await req.json();

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  // Check if user has permission to remove members (must be owner)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is owner of campaign or campaign member with owner role
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("owner_id")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Check if user is owner or has owner role in campaign_members
  const { data: member } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const isOwner = campaign.owner_id === user.id || member?.role === "owner";

  if (!isOwner) {
    return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });
  }

  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", params.id)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}










