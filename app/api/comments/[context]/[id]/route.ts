import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ context: string; id: string }> }
) {
  try {
    const supabase = createClient();
    const { context, id } = await params;

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    if (context !== "lead" && context !== "thread" && context !== "campaign") {
      return NextResponse.json({ error: "Invalid context. Use 'lead', 'thread', or 'campaign'" }, { status: 400 });
    }

    let query = supabase
      .from("comments")
      .select(`
        id,
        user_id,
        body,
        mentions,
        created_at
      `)
      .eq("workspace_id", workspaceId);

    if (context === "lead") {
      query = query.eq("lead_id", id);
    } else if (context === "thread") {
      query = query.eq("thread_id", id);
    } else if (context === "campaign") {
      query = query.eq("campaign_id", id);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Fetch user emails using admin client
    const userIds = [...new Set((data || []).map((c: any) => c.user_id).filter(Boolean))];
    const emailMap = new Map<string, string>();

    if (userIds.length > 0 && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const adminClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      for (const userId of userIds) {
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          if (authUser?.user?.email) {
            emailMap.set(userId, authUser.user.email);
          }
        } catch (e) {
          // Skip if user not found
        }
      }
    }

    // Transform data to match expected format
    const comments = (data || []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      body: c.body,
      mentions: c.mentions || [],
      created_at: c.created_at,
      user: {
        email: emailMap.get(c.user_id) || null,
      },
    }));

    return NextResponse.json({ comments });
  } catch (error: any) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch comments" }, { status: 500 });
  }
}

