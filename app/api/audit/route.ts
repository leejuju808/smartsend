import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();
  const params = new URL(req.url).searchParams;

  let query = supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const campaignId = params.get("campaignId");
  const userId = params.get("userId");
  const entityType = params.get("entityType");
  const action = params.get("action");

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (userId) query = query.eq("actor_user_id", userId);
  if (entityType) query = query.eq("entity_type", entityType);
  if (action) query = query.eq("action", action as any);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}




