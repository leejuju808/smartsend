// app/api/campaigns/[campaignId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.campaignId)
    .eq("owner_id", user.id)
    .single();

  if (error || !data) {
    console.error("Error loading campaign:", error);
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: {
    name?: string;
    goal?: string;
    status?: "draft" | "active" | "paused";
    sequence?: any[];
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const update: Record<string, any> = {};
  if (typeof payload.name === "string") update.name = payload.name;
  if (typeof payload.goal === "string") update.goal = payload.goal;
  if (typeof payload.status === "string") update.status = payload.status;
  if (Array.isArray(payload.sequence)) update.sequence = payload.sequence;

  if (!Object.keys(update).length) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", params.campaignId)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}

