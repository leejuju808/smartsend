// SmartSend — Compose v2 (Templates • Variables • Schedule)
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const { id, name, subject, body } = await req.json();

    if (!name || !subject || !body) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const supabase = createSupabaseServer();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Use Supabase client instead of REST API for better auth handling
    if (id) {
      // Update existing template
      const { error } = await supabase
        .from("templates")
        .update({ name, subject, body })
        .eq("id", id)
        .eq("user_id", user.id);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      // Create new template
      const { error } = await supabase
        .from("templates")
        .insert({ user_id: user.id, name, subject, body });
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving template:", error);
    return NextResponse.json(
      { error: "Failed to save template" },
      { status: 500 }
    );
  }
}
