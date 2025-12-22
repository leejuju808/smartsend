import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query params for filtering
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = supabase
      .from("marketing_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data: posts, error } = await query;

    if (error) {
      console.error("Error fetching marketing posts:", error);
      return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }

    return NextResponse.json({ posts: posts || [] });
  } catch (error) {
    console.error("Error in GET /api/marketing:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, title, content, status, publish_date } = body;

    if (!type || !content) {
      return NextResponse.json(
        { error: "Missing required fields: type and content" },
        { status: 400 }
      );
    }

    if (!["thread", "video", "email"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'thread', 'video', or 'email'" },
        { status: 400 }
      );
    }

    // Validate publish_date if status is scheduled
    if (status === "scheduled" && !publish_date) {
      return NextResponse.json(
        { error: "publish_date required when status is 'scheduled'" },
        { status: 400 }
      );
    }

    const { data: post, error } = await supabase
      .from("marketing_posts")
      .insert({
        type,
        title: title || null,
        content,
        status: status || "draft",
        publish_date: publish_date || null,
        metrics: {},
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating marketing post:", error);
      return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Error in POST /api/marketing:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

