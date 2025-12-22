import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { email, action, points, tag } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (action === "increment") {
      // Increment score by points
      const { error } = await supabase.rpc("increment_score", {
        p_email: email,
        p_type: points > 0 ? "custom" : "custom"
      });

      if (error) {
        console.error("Error incrementing score:", error);
        return NextResponse.json({ error: "Failed to increment score" }, { status: 500 });
      }

      // Manually update the score if it's a custom increment
      if (points !== 0) {
        const { error: updateError } = await supabase
          .from("contacts")
          .update({ lead_score: supabase.sql`lead_score + ${points}` })
          .eq("email", email);

        if (updateError) {
          console.error("Error updating custom score:", updateError);
          return NextResponse.json({ error: "Failed to update custom score" }, { status: 500 });
        }
      }
    } else if (action === "add_tag") {
      // Add tag bonus
      if (!tag) {
        return NextResponse.json({ error: "Tag is required for add_tag action" }, { status: 400 });
      }

      const { error } = await supabase.rpc("add_tag_bonus", {
        p_email: email,
        p_tag: tag
      });

      if (error) {
        console.error("Error adding tag bonus:", error);
        return NextResponse.json({ error: "Failed to add tag bonus" }, { status: 500 });
      }
    } else if (action === "recompute") {
      // Recompute all scores
      const { error } = await supabase.rpc("recompute_lead_scores");
      
      if (error) {
        console.error("Error recomputing scores:", error);
        return NextResponse.json({ error: "Failed to recompute scores" }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 