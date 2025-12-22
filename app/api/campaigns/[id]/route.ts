import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "campaign_not_found", details: error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();

  const {
    name,
    subject,
    from_name,
    from_email,
    content_html,
    content_text,
    send_at,
    segmentId,
    listId, // Block 10800
    status,
  } = body;

  const update: any = {
    name,
    subject,
    from_name,
    from_email,
    content_html: content_html || content_text,
    content_text,
    send_at,
    status,
    segment_id: segmentId === undefined ? undefined : segmentId ?? null,
    list_id: listId === undefined ? undefined : listId ?? null, // Block 10800
  };

  // Remove undefined fields
  Object.keys(update).forEach((key) => {
    if (update[key] === undefined) {
      delete update[key];
    }
  });

  const { data, error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "update_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}






