import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership before deleting
  const { data: share, error: shareError } = await supabase
    .from("shared_items")
    .select("owner_id")
    .eq("id", params.id)
    .single();

  if (shareError || !share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  if (share.owner_id !== user.id) {
    return NextResponse.json(
      { error: "You can only revoke shares you created" },
      { status: 403 }
    );
  }

  const { error: deleteError } = await supabase
    .from("shared_items")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}










