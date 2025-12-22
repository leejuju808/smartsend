import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/saved-views-v2/seed-defaults
// Seeds default views for a workspace (can be called on workspace creation)
export async function POST(req: NextRequest) {
  const supabase = getServerSupabase();
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  // Verify user is admin/owner
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Default views to create
  const defaultViews = [
    // Leads views
    {
      name: "Hot Leads",
      entity_type: "leads" as const,
      config: {
        filters: [
          { field: "score", operator: ">", value: 70 },
        ],
        sort: [{ field: "score", direction: "desc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Lead Management",
    },
    {
      name: "Engaged Leads",
      entity_type: "leads" as const,
      config: {
        filters: [
          { field: "status", operator: "in", value: ["opened", "clicked", "replied"] },
        ],
        sort: [{ field: "created_at", direction: "desc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Lead Management",
    },
    {
      name: "New Leads This Week",
      entity_type: "leads" as const,
      config: {
        filters: [
          { field: "created_at", operator: ">=", value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
        ],
        sort: [{ field: "created_at", direction: "desc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Lead Management",
    },
    // Campaigns views
    {
      name: "Active Only",
      entity_type: "campaigns" as const,
      config: {
        filters: [
          { field: "status", operator: "=", value: "active" },
        ],
        sort: [{ field: "created_at", direction: "desc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Outbound Performance",
    },
    {
      name: "Best Performers",
      entity_type: "campaigns" as const,
      config: {
        filters: [
          { field: "reply_rate", operator: ">", value: 0.1 },
        ],
        sort: [{ field: "reply_rate", direction: "desc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Outbound Performance",
    },
    // Inboxes views
    {
      name: "Healthy",
      entity_type: "inboxes" as const,
      config: {
        filters: [
          { field: "health_score", operator: ">", value: 80 },
        ],
        sort: [{ field: "health_score", direction: "desc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Deliverability",
    },
    {
      name: "Needs Attention",
      entity_type: "inboxes" as const,
      config: {
        filters: [
          { field: "health_score", operator: ">=", value: 50 },
          { field: "health_score", operator: "<=", value: 80 },
        ],
        sort: [{ field: "health_score", direction: "asc" }],
        hiddenColumns: [],
      },
      shared: true,
      is_default: false,
      category: "Deliverability",
    },
  ];

  // Check if views already exist
  const { data: existingViews } = await supabase
    .from("saved_views")
    .select("name, entity_type")
    .eq("workspace_id", workspaceId)
    .in("name", defaultViews.map(v => v.name));

  const existingNames = new Set(existingViews?.map(v => `${v.name}:${v.entity_type}`) || []);

  // Insert only views that don't exist
  const viewsToInsert = defaultViews.filter(
    v => !existingNames.has(`${v.name}:${v.entity_type}`)
  ).map(v => ({
    ...v,
    workspace_id: workspaceId,
    user_id: user.id,
  }));

  if (viewsToInsert.length === 0) {
    return NextResponse.json({ 
      ok: true, 
      message: "Default views already exist",
      created: 0 
    });
  }

  const { data: createdViews, error } = await supabase
    .from("saved_views")
    .insert(viewsToInsert)
    .select();

  if (error) {
    console.error("Error seeding default views:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    ok: true, 
    created: createdViews?.length || 0,
    views: createdViews 
  });
}



