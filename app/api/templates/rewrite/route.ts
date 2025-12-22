// app/api/templates/rewrite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { rewriteTemplate, RewriteStyle } from "@/lib/ai/template-rewriter";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const {
      subject,
      body,
      style,
      context,
      workspaceId,
    }: {
      subject: string;
      body: string;
      style: RewriteStyle;
      context?: string;
      workspaceId?: string;
    } = await req.json();

    if (!subject || !body || !style) {
      return NextResponse.json(
        { error: "subject, body and style are required" },
        { status: 400 }
      );
    }

    // Optional: check the user is allowed to work on this workspace
    if (workspaceId) {
      const {
        data: membership,
        error: membershipError,
      } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        return NextResponse.json(
          { error: "Not authorized for this workspace" },
          { status: 403 }
        );
      }
    }

    const result = await rewriteTemplate({
      subject,
      body,
      style,
      context,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Template rewrite error:", err);
    return NextResponse.json(
      {
        error: "Failed to rewrite template",
      },
      { status: 500 }
    );
  }
}
