// Block 20280 — Conversation Tags API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAccountIdFromCampaign(
  supabase: ReturnType<typeof createClient>,
  campaignId: string
): Promise<string | null> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("account_id, user_id, workspace_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return null;
  }

  // Determine account_id (could be account_id, user_id, or workspace_id)
  return campaign.account_id || campaign.user_id || campaign.workspace_id || null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { conversation_id, tag_ids } = body as {
      conversation_id?: string;
      tag_ids?: string[];
    };

    if (!conversation_id || !Array.isArray(tag_ids)) {
      return NextResponse.json(
        { error: "conversation_id and tag_ids[] are required" },
        { status: 400 }
      );
    }

    // 1) Load current thread to get campaign_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("id", conversation_id)
      .single();

    if (threadError || !thread) {
      console.error("Conversation tags thread error", threadError);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Get account_id from campaign
    const account_id = await getAccountIdFromCampaign(supabase, thread.campaign_id);

    if (!account_id) {
      return NextResponse.json(
        { error: "Could not determine account" },
        { status: 400 }
      );
    }

    // 3) Clear existing tags
    const { error: delErr } = await supabase
      .from("conversation_tags")
      .delete()
      .eq("conversation_id", conversation_id);

    if (delErr) {
      console.error("Conversation tags delete error", delErr);
      return NextResponse.json(
        { error: "Failed to update tags" },
        { status: 500 }
      );
    }

    // 4) Insert new ones
    const uniqueIds = Array.from(new Set(tag_ids.filter(Boolean)));
    if (uniqueIds.length > 0) {
      // Verify all tags belong to the same account
      const { data: tags, error: tagsError } = await supabase
        .from("lead_tags")
        .select("id")
        .in("id", uniqueIds)
        .eq("account_id", account_id)
        .eq("is_active", true);

      if (tagsError) {
        console.error("Tag verification error", tagsError);
        return NextResponse.json(
          { error: "Failed to verify tags" },
          { status: 500 }
        );
      }

      const validTagIds = tags?.map((t) => t.id) || [];
      const invalidTagIds = uniqueIds.filter((id) => !validTagIds.includes(id));

      if (invalidTagIds.length > 0) {
        console.warn("Some tags are invalid or belong to different account:", invalidTagIds);
      }

      if (validTagIds.length > 0) {
        const toInsert = validTagIds.map((tagId) => ({
          conversation_id,
          tag_id: tagId,
        }));

        const { error: insErr } = await supabase
          .from("conversation_tags")
          .insert(toInsert);

        if (insErr) {
          console.error("Conversation tags insert error", insErr);
          return NextResponse.json(
            { error: "Failed to insert tags" },
            { status: 500 }
          );
        }
      }
    }

    // 5) Return tags with labels for this conversation
    const { data: rows, error: joinErr } = await supabase
      .from("conversation_tags")
      .select(
        `
        tag_id,
        lead_tags!inner (
          id,
          label,
          color,
          category
        )
      `
      )
      .eq("conversation_id", conversation_id)
      .eq("lead_tags.account_id", account_id)
      .eq("lead_tags.is_active", true);

    if (joinErr) {
      console.error("Conversation tags join error", joinErr);
      return NextResponse.json(
        { error: "Failed to load updated tags" },
        { status: 500 }
      );
    }

    const tags = (rows || []).map((r: any) => r.lead_tags);

    // 6) Log in activity (if inbox_activity_log exists)
    try {
      await supabase.from("inbox_activity_log").insert({
        thread_id: conversation_id,
        campaign_id: thread.campaign_id,
        user_id: user.id,
        type: "tag",
        title: "Lead tags updated",
        meta: {
          tag_ids: uniqueIds,
        },
      });
    } catch (logError) {
      // Not fatal if activity log doesn't exist or fails
      console.warn("Failed to log tag activity:", logError);
    }

    return NextResponse.json({ tags });
  } catch (error: any) {
    console.error("Error in POST /api/inbox/conversation-tags:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

















































