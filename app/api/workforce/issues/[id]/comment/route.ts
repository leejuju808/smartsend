// POST /api/workforce/issues/[id]/comment
// Add a comment to an issue

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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
    const body = await req.json();
    const { comment, employee_id } = body;

    if (!comment) {
      return NextResponse.json(
        { error: "comment is required" },
        { status: 400 }
      );
    }

    // Insert comment
    const { data, error } = await supabase
      .from("crew_issue_comments")
      .insert({
        issue_id: issueId,
        employee_id: employee_id || null,
        user_id: employee_id ? null : user.id,
        comment,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating comment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, comment: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/issues/[id]/comment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























