import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: post, error } = await supabase
      .from("marketing_posts")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Error in GET /api/marketing/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updates: any = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.status !== undefined) updates.status = body.status;
    if (body.publish_date !== undefined) updates.publish_date = body.publish_date;
    if (body.metrics !== undefined) updates.metrics = body.metrics;

    const { data: post, error } = await supabase
      .from("marketing_posts")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating marketing post:", error);
      return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Error in PATCH /api/marketing/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("marketing_posts")
      .delete()
      .eq("id", params.id);

    if (error) {
      console.error("Error deleting marketing post:", error);
      return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/marketing/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

