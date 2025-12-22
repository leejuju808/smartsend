// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Team Comments
// GET /api/teams/comments - List comments
// POST /api/teams/comments - Create comment

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");
    const teamId = searchParams.get("team_id");

    if (!orgId) {
      return NextResponse.json(
        { error: "org_id is required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("team_comments")
      .select(
        `
        *,
        created_by_user:created_by_user_id (
          id,
          email
        ),
        created_by_team:created_by_team_id (
          id,
          name,
          team_type
        )
      `
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    // Filter by team if specified (show comments where user is tagged or team is tagged)
    if (teamId) {
      query = query.or(
        `tagged_team_ids.cs.{${teamId}},created_by_team_id.eq.${teamId}`
      );
    }

    const { data: comments, error: commentsError } = await query;

    if (commentsError) {
      console.error("Error fetching comments:", commentsError);
      return NextResponse.json(
        { error: "Failed to fetch comments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ comments: comments || [] });
  } catch (error) {
    console.error("Error in GET /api/teams/comments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      org_id,
      entity_type,
      entity_id,
      comment,
      tagged_team_ids = [],
      tagged_user_ids = [],
      metadata = {},
    } = body;

    if (!org_id || !entity_type || !entity_id || !comment) {
      return NextResponse.json(
        {
          error:
            "org_id, entity_type, entity_id, and comment are required",
        },
        { status: 400 }
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id, role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get user's team (if any)
    const { data: userTeam } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Create comment
    const { data: newComment, error: commentError } = await supabase
      .from("team_comments")
      .insert({
        org_id,
        entity_type,
        entity_id,
        comment,
        created_by_user_id: user.id,
        created_by_team_id: userTeam?.team_id || null,
        tagged_team_ids: tagged_team_ids || [],
        tagged_user_ids: tagged_user_ids || [],
        metadata,
      })
      .select(
        `
        *,
        created_by_user:created_by_user_id (
          id,
          email
        ),
        created_by_team:created_by_team_id (
          id,
          name,
          team_type
        )
      `
      )
      .single();

    if (commentError) {
      console.error("Error creating comment:", commentError);
      return NextResponse.json(
        { error: "Failed to create comment" },
        { status: 500 }
      );
    }

    // Create notifications for tagged users/teams
    const allTaggedUserIds = [
      ...new Set([
        ...(tagged_user_ids || []),
        ...(tagged_team_ids || []).map(async (tid: string) => {
          const { data: teamMembers } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("team_id", tid)
            .eq("is_active", true);
          return teamMembers?.map((m) => m.user_id) || [];
        }),
      ]),
    ];

    // Flatten and deduplicate
    const uniqueUserIds = [
      ...new Set(
        (
          await Promise.all(
            tagged_team_ids.map(async (tid: string) => {
              const { data: teamMembers } = await supabase
                .from("team_members")
                .select("user_id")
                .eq("team_id", tid)
                .eq("is_active", true);
              return teamMembers?.map((m) => m.user_id) || [];
            })
          )
        ).flat(),
        ...(tagged_user_ids || [])
      ),
    ].filter((id) => id !== user.id); // Don't notify the creator

    // Create notifications (if notification system exists)
    for (const userId of uniqueUserIds) {
      try {
        await supabase.rpc("create_team_comment_notification", {
          p_org_id: org_id,
          p_user_id: userId,
          p_comment_id: newComment.id,
          p_entity_type: entity_type,
          p_entity_id: entity_id,
        });
      } catch (err) {
        // Notification system might not exist yet, that's okay
        console.log("Notification system not available:", err);
      }
    }

    return NextResponse.json({ comment: newComment }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/teams/comments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































