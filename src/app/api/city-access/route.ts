import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

const CITY_ACCESS_INACTIVITY_DAYS = 7;

type CityAccessStatus = "active" | "at_risk";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  // Verify requester is a member of this workspace (do not trust cookie alone).
  const { data: membership, error: memberErr } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberErr) {
    return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pick a "current city" from the most recently created active/running campaign with a market_key.
  const { data: campaigns, error: campErr } = await supabaseAdmin
    .from("campaigns")
    .select("id, market_city, market_state, market_key, created_at, status, paused")
    .eq("workspace_id", workspaceId)
    .not("market_key", "is", null)
    .in("status", ["active", "running"])
    .or("paused.is.null,paused.eq.false")
    .order("created_at", { ascending: false })
    .limit(25);

  if (campErr) {
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }

  const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);
  const primary = (campaigns ?? [])[0] as any | undefined;

  // Determine last sending activity (only once they've sent before).
  let lastSendAt: string | null = null;
  if (campaignIds.length > 0) {
    const { data: last, error: lastErr } = await supabaseAdmin
      .from("send_logs")
      .select("sent_at")
      .in("campaign_id", campaignIds)
      .in("status", ["sent", "delivered"])
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastErr) {
      lastSendAt = (last as any)?.sent_at ?? null;
    }
  }

  const now = Date.now();
  const daysInactive =
    lastSendAt == null
      ? null
      : Math.floor((now - new Date(lastSendAt).getTime()) / (24 * 60 * 60 * 1000));

  // Only mark "At Risk" once they have a real lastSendAt to anchor the warning.
  const status: CityAccessStatus =
    lastSendAt && (daysInactive ?? 0) >= CITY_ACCESS_INACTIVITY_DAYS ? "at_risk" : "active";

  return NextResponse.json({
    workspace_id: workspaceId,
    market: primary
      ? {
          city: primary.market_city ?? null,
          state: primary.market_state ?? null,
          market_key: primary.market_key ?? null,
        }
      : { city: null, state: null, market_key: null },
    status,
    last_send_at: lastSendAt,
    days_inactive: daysInactive,
    inactivity_days_threshold: CITY_ACCESS_INACTIVITY_DAYS,
    copy: {
      headline: status === "at_risk" ? "City Status: At Risk" : "City Status: Active",
      subtext:
        status === "at_risk"
          ? "Inactive cities may be reassigned."
          : "SmartSend prioritizes active roofers per city.",
      early: "SmartSend is rolling out city by city.",
    },
  });
}

