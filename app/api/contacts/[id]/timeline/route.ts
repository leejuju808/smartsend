import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Verify contact exists and belongs to workspace
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  // Get query parameters
  const searchParams = req.nextUrl.searchParams;
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const typesParam = searchParams.get("types");
  const types = typesParam ? typesParam.split(",") : null;

  // Build query
  let query = supabase
    .from("contact_timeline_events")
    .select("*")
    .eq("contact_id", params.id)
    .order("occurred_at", { ascending: false })
    .limit(limit + 1); // Fetch one extra to check if there's more

  // Filter by types if provided
  if (types && types.length > 0) {
    query = query.in("type", types);
  }

  // Apply cursor pagination if provided
  if (cursor) {
    // Parse cursor (format: "occurred_at|id")
    const [cursorTime, cursorId] = cursor.split("|");
    query = query.or(
      `occurred_at.lt.${cursorTime},and(occurred_at.eq.${cursorTime},id.lt.${cursorId})`
    );
  }

  const { data: events, error } = await query;

  if (error) {
    console.error("Timeline query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if there are more results
  const hasMore = events && events.length > limit;
  const resultEvents = hasMore ? events.slice(0, limit) : (events || []);

  // Generate next cursor
  const nextCursor = hasMore && resultEvents.length > 0
    ? `${resultEvents[resultEvents.length - 1].occurred_at}|${resultEvents[resultEvents.length - 1].id}`
    : null;

  return NextResponse.json({
    events: resultEvents,
    nextCursor,
  });
}





























































