// Block 21733 — SmartSend Roofing Lead Timeline v2
// API Route — Fetch Timeline with Filters, Search, and Time Range

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const url = new URL(req.url);
  const lead_id = url.searchParams.get("lead_id");
  const types = url.searchParams.get("types"); // comma-separated event_types
  const search = url.searchParams.get("search"); // text search in message/metadata
  const days = url.searchParams.get("days"); // 7, 30, 90, etc.

  if (!lead_id) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  let query = supabase
    .from("lead_timeline_events")
    .select("*")
    .eq("lead_id", lead_id);

  // Filter by event types
  if (types) {
    const arr = types.split(",").map((t) => t.trim()).filter(Boolean);
    if (arr.length > 0) {
      query = query.in("event_type", arr);
    }
  }

  // Filter by time range
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - Number(days));
    query = query.gte("created_at", since.toISOString());
  }

  // Search in message and metadata
  if (search) {
    // Use ilike for case-insensitive search
    // Search in both message field and metadata JSONB (as text)
    // Note: Supabase PostgREST .or() syntax uses comma-separated conditions
    const searchPattern = `%${search}%`;
    query = query.or(`message.ilike.${searchPattern},metadata::text.ilike.${searchPattern}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

