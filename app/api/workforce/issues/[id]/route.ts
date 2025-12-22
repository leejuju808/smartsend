// GET /api/workforce/issues/[id]
// Get single issue with comments

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const issueId = params.id;

    // Fetch issue with related data
    const { data: issue, error: issueError } = await supabase
      .from("crew_issues")
      .select(`
        *,
        jobs:job_id (
          id,
          job_name,
          title,
          address
        ),
        workforce_employees:employee_id (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .eq("id", issueId)
      .single();

    if (issueError) {
      console.error("Error fetching issue:", issueError);
      return NextResponse.json({ error: issueError.message }, { status: 500 });
    }

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Fetch comments
    const { data: comments, error: commentsError } = await supabase
      .from("crew_issue_comments")
      .select(`
        *,
        workforce_employees:employee_id (
          id,
          first_name,
          last_name
        ),
        users:user_id (
          id,
          email
        )
      `)
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true });

    if (commentsError) {
      console.error("Error fetching comments:", commentsError);
    }

    return NextResponse.json({
      issue,
      comments: comments || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/issues/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























