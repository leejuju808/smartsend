import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = await params;
  
  const { error } = await supabase
    .from("lead_notifications")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Failed to mark notification seen:", error);
    return NextResponse.json(
      { error: "Failed to mark seen" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

