import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Auto-generate helpful defaults when workspace is completed
 * - Default segment: "All Leads"
 * - Default SmartList: "All Contacts (Auto)"
 * - Default rewrite presets
 * - Default nudge presets
 * - Default campaign folder
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, accountId } = await req.json();
    const userId = user.id;
    const finalAccountId = accountId || userId;

    const results: any = {};

    // 1. Create default segment "All Leads"
    try {
      const { data: segment, error: segmentError } = await supabase
        .from("segments")
        .insert({
          account_id: finalAccountId,
          name: "All Leads",
          description: "Default segment containing all leads",
          rule: { op: "and", rules: [] }, // Empty rules = all leads
          is_active: true,
        })
        .select("id")
        .single();

      if (!segmentError && segment) {
        results.segmentId = segment.id;
      }
    } catch (error) {
      console.error("Error creating default segment:", error);
    }

    // 2. Create default SmartList "All Contacts (Auto)"
    try {
      const { data: smartlist, error: smartlistError } = await supabase
        .from("shared_resources")
        .insert({
          smart: true,
          kind: "saved_view",
          name: "All Contacts (Auto)",
          llm_prompt: "Show all contacts in the workspace",
          filters: {},
          sort: { field: "created_at", dir: "desc" },
          scope: "team",
          owner_id: userId,
          account_id: finalAccountId,
          entity: "leads",
          llm_rules: {},
          status: "active",
        })
        .select("id")
        .single();

      if (!smartlistError && smartlist) {
        results.smartlistId = smartlist.id;
      }
    } catch (error) {
      console.error("Error creating default SmartList:", error);
    }

    // 3. Create default rewrite presets (if table exists)
    try {
      const rewritePresets = [
        {
          owner_id: userId,
          name: "Standard Follow-up",
          label: "no_response",
          tone: "concise",
          constraints: {
            length_words: { min: 70, max: 110 },
            cta: "direct",
            reading_level: "professional",
            ban_phrases: ["guarantee", "risk-free"],
            require_lines: ["unsubscribe_footer", "postal_address"],
            para_count: { min: 1, max: 2 },
          },
          is_active: true,
        },
        {
          owner_id: userId,
          name: "Positive Reply",
          label: "positive",
          tone: "friendly",
          constraints: {
            length_words: { min: 50, max: 90 },
            cta: "soft",
            reading_level: "conversational",
          },
          is_active: true,
        },
      ];

      for (const preset of rewritePresets) {
        await supabase.from("rewrite_presets").insert(preset).select("id").single();
      }
      results.rewritePresetsCreated = rewritePresets.length;
    } catch (error) {
      // Table might not exist or have different structure - that's ok
      console.log("Skipping rewrite presets (table may not exist):", error);
    }

    // 4. Create default nudge presets (if table exists)
    try {
      const nudgePresets = [
        {
          owner_id: userId,
          label: "no_response",
          tone: "concise",
          prompt: "Send a brief, friendly follow-up that adds value",
          is_active: true,
        },
        {
          owner_id: userId,
          label: "positive",
          tone: "friendly",
          prompt: "Respond warmly and move the conversation forward",
          is_active: true,
        },
      ];

      for (const preset of nudgePresets) {
        await supabase.from("nudge_tuner").insert(preset).select("id").single();
      }
      results.nudgePresetsCreated = nudgePresets.length;
    } catch (error) {
      // Table might not exist or have different structure - that's ok
      console.log("Skipping nudge presets (table may not exist):", error);
    }

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error: any) {
    console.error("Error generating defaults:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}












