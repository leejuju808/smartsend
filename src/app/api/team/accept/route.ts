import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
    }

    // Get current user from session
    const cookieStore = await cookies();
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (k) => cookieStore.get(k)?.value,
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Update team_members row to set accepted_at
    const { error: updateError } = await supabaseAdmin
      .from("team_members")
      .update({ 
        accepted_at: new Date().toISOString(),
        user_id: user.id, // Ensure correct user_id
      })
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id);

    if (updateError) {
      // If no row exists, create one
      if (updateError.code === 'PGRST116') {
        const { error: insertError } = await supabaseAdmin
          .from("team_members")
          .insert({
            workspace_id,
            user_id: user.id,
            role: 'member',
            accepted_at: new Date().toISOString(),
          });

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error accepting team invitation:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
