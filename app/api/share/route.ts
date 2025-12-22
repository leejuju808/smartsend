import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { item_type, item_id, target_user_id, access } = body;

  // Validate input
  if (!item_type || !item_id || !target_user_id) {
    return NextResponse.json(
      { error: "item_type, item_id, and target_user_id are required" },
      { status: 400 }
    );
  }

  if (!["campaign", "segment", "template", "lead_view"].includes(item_type)) {
    return NextResponse.json(
      { error: "Invalid item_type. Must be campaign, segment, template, or lead_view" },
      { status: 400 }
    );
  }

  if (access && !["view", "edit"].includes(access)) {
    return NextResponse.json(
      { error: "Invalid access. Must be view or edit" },
      { status: 400 }
    );
  }

  // Verify that the item exists and user owns it
  let itemExists = false;
  let tableName = "";

  switch (item_type) {
    case "campaign":
      tableName = "campaigns";
      break;
    case "segment":
      tableName = "segment_definitions";
      break;
    case "template":
      tableName = "templates";
      break;
    case "lead_view":
      tableName = "saved_views";
      break;
  }

  // Check ownership - campaigns use user_id, others use owner_id or created_by
  const ownershipField =
    item_type === "campaign" ? "user_id" : item_type === "template" ? "created_by" : "owner_id";

  const { data: item, error: itemError } = await supabase
    .from(tableName)
    .select("id")
    .eq("id", item_id)
    .eq(ownershipField, user.id)
    .single();

  if (itemError || !item) {
    return NextResponse.json(
      { error: "Item not found or you don't have permission to share it" },
      { status: 403 }
    );
  }

  // Insert share
  const { error: shareError } = await supabase.from("shared_items").insert({
    owner_id: user.id,
    target_user_id,
    item_type,
    item_id,
    access: access || "view",
  });

  if (shareError) {
    // Handle duplicate share gracefully
    if (shareError.code === "23505") {
      // Update existing share
      const { error: updateError } = await supabase
        .from("shared_items")
        .update({ access: access || "view" })
        .eq("owner_id", user.id)
        .eq("target_user_id", target_user_id)
        .eq("item_type", item_type)
        .eq("item_id", item_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: shareError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}










