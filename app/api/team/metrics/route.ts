import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user's default workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    let finalWorkspaceId = workspaceId;

    // If no workspace_id provided, get user's workspace
    if (!finalWorkspaceId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.workspace_id) {
        finalWorkspaceId = profile.workspace_id;
      } else {
        // Try workspace_members table
        const { data: member } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (member?.workspace_id) {
          finalWorkspaceId = member.workspace_id;
        }
      }
    }

    if (!finalWorkspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify user has access to this workspace
    const { data: hasAccess } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", finalWorkspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch user metrics for all users in the workspace
    const { data: metrics, error: metricsError } = await supabase
      .from("user_metrics")
      .select(`
        user_id,
        emails_sent,
        replies_received,
        meetings_booked,
        opens,
        clicks,
        updated_at
      `)
      .eq("workspace_id", finalWorkspaceId);

    if (metricsError) {
      console.error("Error fetching metrics:", metricsError);
      return NextResponse.json({ error: metricsError.message }, { status: 500 });
    }

    // Fetch user emails for display using service role client
    const userIds = (metrics || []).map((m) => m.user_id).filter(Boolean);
    const userEmails: Record<string, string> = {};

    if (userIds.length > 0) {
      // Use service role client to fetch user emails
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Fetch emails from auth.users via admin API
      for (const userId of userIds) {
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          if (authUser?.user?.email) {
            userEmails[userId] = authUser.user.email;
          }
        } catch (e) {
          // Skip if user not found
        }
      }

      // Fallback: try profiles table
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      if (profiles) {
        for (const p of profiles) {
          if (p.email && !userEmails[p.id]) {
            userEmails[p.id] = p.email;
          }
        }
      }
    }

    // Combine metrics with user emails
    const metricsWithUsers = (metrics || []).map((m) => ({
      ...m,
      email: userEmails[m.user_id] || null,
    }));

    return NextResponse.json({ metrics: metricsWithUsers });
  } catch (error) {
    console.error("Error in team metrics API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

