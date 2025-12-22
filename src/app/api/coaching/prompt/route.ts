import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/coaching/prompt
// Returns the most relevant coaching prompt for the current user
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call the database function to get the coaching prompt
    const { data, error } = await supabase.rpc("get_coaching_prompt_for_user", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("Error fetching coaching prompt:", error);
      // Fallback to default prompt if function fails
      const { data: fallbackData } = await supabase
        .from("coaching_prompts")
        .select("*")
        .eq("trigger_type", "no_activity")
        .limit(1)
        .single();

      if (fallbackData) {
        return NextResponse.json({
          id: fallbackData.id,
          type: fallbackData.trigger_type,
          title: fallbackData.title,
          message: fallbackData.message,
          actionButton: fallbackData.action_button,
          actionUrl: fallbackData.action_url,
        });
      }

      return NextResponse.json({ error: "Failed to fetch coaching prompt" }, { status: 500 });
    }

    if (!data || data.length === 0) {
      // No prompt found, return default
      const { data: defaultData } = await supabase
        .from("coaching_prompts")
        .select("*")
        .eq("trigger_type", "no_activity")
        .limit(1)
        .single();

      if (defaultData) {
        return NextResponse.json({
          id: defaultData.id,
          type: defaultData.trigger_type,
          title: defaultData.title,
          message: defaultData.message,
          actionButton: defaultData.action_button,
          actionUrl: defaultData.action_url,
        });
      }

      return NextResponse.json({ error: "No coaching prompt found" }, { status: 404 });
    }

    const prompt = data[0];
    return NextResponse.json({
      id: prompt.prompt_id,
      type: prompt.trigger_type,
      title: prompt.title,
      message: prompt.message,
      actionButton: prompt.action_button,
      actionUrl: prompt.action_url,
    });
  } catch (error: any) {
    console.error("Error in coaching prompt API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}


























