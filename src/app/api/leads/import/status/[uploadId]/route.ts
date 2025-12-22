import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uploadId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data, error } = await supabase
      .from("lead_uploads")
      .select("status, total_rows, valid_rows, invalid_rows, error_msg")
      .eq("id", params.uploadId)
      .single();

    if (error) {
      console.error("Error fetching upload status:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in import/status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

