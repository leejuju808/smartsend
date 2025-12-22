import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  const { error } = await supabase
    .from("leads")
    .update({ status: "unsubscribed" })
    .eq("id", leadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}










