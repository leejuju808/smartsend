import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET: ?workspaceId=uuid
 * Returns: { plan: 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ plan: data?.subscription_status || "free" });
}