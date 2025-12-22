import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getSessionUserId } from "../threads/_shared/assignment";

export async function GET(req: NextRequest) {
  try {
    const actorId = await getSessionUserId();
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId") ?? url.searchParams.get("campaign_id");

    const allowed = new Set<string>();

    const [{ data: owned }, { data: member }] = await Promise.all([
      service.from("campaigns").select("id").eq("user_id", actorId),
      service
        .from("campaign_members")
        .select("campaign_id, role")
        .eq("user_id", actorId)
        .in("role", ["owner", "editor"]),
    ]);

    for (const row of owned ?? []) {
      if (row?.id) {
        allowed.add(row.id);
      }
    }
    for (const row of member ?? []) {
      if (row?.campaign_id) {
        allowed.add(row.campaign_id);
      }
    }

    if (campaignId) {
      if (!allowed.has(campaignId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      allowed.clear();
      allowed.add(campaignId);
    }

    const campaigns = Array.from(allowed);

    if (campaigns.length === 0) {
      return NextResponse.json([]);
    }

    let query = service
      .from("v_inbox_needs_response")
      .select("*")
      .order("is_overdue", { ascending: false })
      .order("due_at", { ascending: true });

    query = query.in("campaign_id", campaigns);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


